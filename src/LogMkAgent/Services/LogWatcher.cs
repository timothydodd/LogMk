using System.Collections.Concurrent;
using System.Diagnostics.Eventing.Reader;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using LogMkAgent.Common;
using LogMkCommon;
using Microsoft.Extensions.Options;
using LogLevel = LogMkCommon.LogLevel;

namespace LogMkAgent.Services;

public class LogWatcher : BackgroundService
{
    private readonly List<string> _logPaths;
    private readonly List<FileSystemWatcher> _watchers = new List<FileSystemWatcher>();
    private readonly BatchingService _batchingService;
    private readonly ILogger<LogWatcher> _logger;

    // Thread-safe collections
    private readonly ConcurrentDictionary<string, PodSettings> _podSettings = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, DeploymentSettings> _deploymentSettings = new(StringComparer.OrdinalIgnoreCase);

    // Debouncing mechanism to handle rapid file changes
    private readonly ConcurrentDictionary<string, DateTime> _lastProcessedTime = new();
    private readonly TimeSpan _debounceInterval = TimeSpan.FromMilliseconds(100);

    // Caching for performance
    private readonly ConcurrentDictionary<string, LogLevel> _logLevelCache = new();
    private const int MaxCacheSize = 1000;

    private LogLevel _defaultLogLevel = LogLevel.Information;
    private readonly SemaphoreSlim _fileSemaphore = new(Environment.ProcessorCount);

    // Static readonly for better performance
    // Moved to LogParser class in LogMkCommon

    // Retry configuration
    private const int MaxRetryAttempts = 3;
    private static readonly TimeSpan[] RetryDelays = { TimeSpan.FromMilliseconds(50), TimeSpan.FromMilliseconds(200), TimeSpan.FromMilliseconds(500) };
    private readonly HashSet<string> _validExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".log", ".txt", ".csv", ".evtx"  // Add .evtx
    };
    private readonly int _maxDaysOld = 30; // Maximum age of logs to process

    public LogWatcher(BatchingService batchingService, IOptions<LogWatcherOptions> options, LogApiClient client, ILogger<LogWatcher> logger)
    {
        _batchingService = batchingService ?? throw new ArgumentNullException(nameof(batchingService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));

        var optionsValue = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _logPaths = optionsValue.Paths ?? throw new ArgumentException("Paths cannot be null");
        if (optionsValue.FilePatterns != null && optionsValue.FilePatterns.Count > 0)
        {
            _validExtensions = new HashSet<string>(optionsValue.FilePatterns.Select(p => Path.GetExtension(p)), StringComparer.OrdinalIgnoreCase);
        }
        _maxDaysOld = optionsValue.MaxDaysOld > 0 ? optionsValue.MaxDaysOld : 30; // Default to 30 days if not set
        ValidateConfiguration(optionsValue);
        InitializeSettings(optionsValue, client);
    }

    private void ValidateConfiguration(LogWatcherOptions options)
    {
        if (options.Paths.Count == 0)
        {
            _logger.LogError("At least one log path must be specified");
            throw new ArgumentException("At least one log path must be specified");
        }

        // Validate that paths exist and are accessible
        foreach (var path in options.Paths)
        {
            if (!Directory.Exists(path))
            {
                _logger.LogWarning("Log path does not exist: {Path}", path);
            }
            else
            {
                try
                {
                    foreach (var filePattern in options.FilePatterns)
                    {
                        // Test read access for each file pattern
                        var files = Directory.EnumerateFiles(path, filePattern, SearchOption.TopDirectoryOnly).Take(1).ToList();
                        if (files.Count == 0)
                        {
                            _logger.LogWarning("No files found matching pattern {FilePattern} in path: {Path}", filePattern, path);
                        }
                    }

                }
                catch (UnauthorizedAccessException)
                {
                    _logger.LogError("No read access to log path: {Path}", path);
                    throw;
                }
            }
        }
    }

    private void InitializeSettings(LogWatcherOptions options, LogApiClient client)
    {
        // Set default log level
        if (options.LogLevel.TryGetValue("Default", out var defaultLevel))
        {
            _logger.LogInformation("Setting default log level to {DefaultLevel}", defaultLevel);
            _defaultLogLevel = defaultLevel;
        }

        // Initialize pod-specific log levels
        foreach (var kvp in options.LogLevel.Where(x => !string.Equals(x.Key, "Default", StringComparison.OrdinalIgnoreCase)))
        {
            var podSettings = GetPodSettings(kvp.Key);
            podSettings.LogLevel = kvp.Value;
        }

        // Set ignored pods
        if (options.IgnorePods != null)
        {
            foreach (var pod in options.IgnorePods)
            {
                var podSettings = GetPodSettings(pod);
                podSettings.Ignore = true;
            }
        }

        // Initialize deployment times
        InitializeDeploymentTimesAsync(client).ConfigureAwait(false);
    }

    private async Task InitializeDeploymentTimesAsync(LogApiClient client)
    {
        try
        {
            var times = await client.GetDataAsync<List<LatestDeploymentEntry>>("api/log/times").ConfigureAwait(false);
            if (times != null)
            {
                _logger.LogInformation("Retrieved latest deployment times for {Count} deployments", times.Count);
                foreach (var pod in times)
                {
                    var settings = GetDeploymentSettings(pod.Deployment);
                    settings.LastDeploymentTime = pod.TimeStamp;
                    _logger.LogDebug("Deployment {Deployment} last wrote at {TimeStamp}", pod.Deployment, pod.TimeStamp);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve deployment times, continuing without them");
        }
    }

    private PodSettings GetPodSettings(string podName)
    {
        return _podSettings.GetOrAdd(podName, _ => new PodSettings
        {
            LogLevel = _defaultLogLevel,
            Ignore = false
        });
    }

    private DeploymentSettings GetDeploymentSettings(string deploymentName)
    {
        return _deploymentSettings.GetOrAdd(deploymentName, _ => new DeploymentSettings
        {
            LastDeploymentTime = null,
            LastReadPosition = 0
        });
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        foreach (var path in _logPaths)
        {
            SetupFileWatcher(path, stoppingToken);
        }

        stoppingToken.Register(() =>
        {
            foreach (var watcher in _watchers)
            {
                try
                {
                    watcher.Dispose();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error disposing file watcher");
                }
            }
        });

        return Task.CompletedTask;
    }

    private void SetupFileWatcher(string path, CancellationToken stoppingToken)
    {
        _logger.LogInformation("Setting up file watcher for path: {Path}", path);

        var watcher = new FileSystemWatcher
        {
            Path = path,
            Filter = "*.*",
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size,
            IncludeSubdirectories = true,
            InternalBufferSize = 65536 // Increase buffer size for high-volume scenarios
        };

        watcher.Changed += (sender, e) => OnLogFileEvent(e, stoppingToken);
        watcher.Created += (sender, e) => OnLogFileEvent(e, stoppingToken);
        watcher.Error += (sender, e) =>
        {
            _logger.LogError(e.GetException(), "File watcher error for path: {Path}", path);
        };

        watcher.EnableRaisingEvents = true;
        _watchers.Add(watcher);
    }

    private void OnLogFileEvent(FileSystemEventArgs e, CancellationToken stoppingToken)
    {
        if (stoppingToken.IsCancellationRequested)
            return;
        var extension = Path.GetExtension(e.FullPath).ToLower();
        if (!_validExtensions.Contains(extension))
        {
            return;
        }
        // Debounce rapid file changes
        var now = DateTime.UtcNow;
        var lastProcessed = _lastProcessedTime.GetOrAdd(e.FullPath, now.Subtract(new TimeSpan(0, 0, 30)));

        if (now - lastProcessed < _debounceInterval)
        {
            return;
        }

        _lastProcessedTime.TryUpdate(e.FullPath, now, lastProcessed);

        if (extension == ".evtx")
        {
            _ = Task.Run(async () => await ProcessEventLogFileAsync(e.FullPath, stoppingToken));
            return;
        }
        // Process asynchronously to avoid blocking the file watcher
        _ = Task.Run(async () =>
        {
            try
            {
                await ProcessLogFileAsync(new PodInfo(e.FullPath), stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing log file: {FilePath}", e.FullPath);
            }
        }, stoppingToken);
    }

    private async Task ProcessLogFileAsync(PodInfo info, CancellationToken stoppingToken)
    {
        var podSettings = GetPodSettings(info.PodName);
        if (podSettings.Ignore)
        {
            return;
        }

        await _fileSemaphore.WaitAsync(stoppingToken).ConfigureAwait(false);
        try
        {
            await ReadNewLinesWithRetryAsync(info, stoppingToken).ConfigureAwait(false);
        }
        finally
        {
            _fileSemaphore.Release();
        }
    }

    private async Task ReadNewLinesWithRetryAsync(PodInfo info, CancellationToken stoppingToken)
    {
        for (int attempt = 0; attempt < MaxRetryAttempts; attempt++)
        {
            try
            {
                await ReadNewLinesAsync(info, stoppingToken).ConfigureAwait(false);
                return; // Success
            }
            catch (IOException ex) when (attempt < MaxRetryAttempts - 1)
            {
                _logger.LogWarning(ex, "IO error reading log file {FilePath}, attempt {Attempt}/{MaxAttempts}",
                    info.LogPath, attempt + 1, MaxRetryAttempts);

                await Task.Delay(RetryDelays[attempt], stoppingToken).ConfigureAwait(false);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogError(ex, "Access denied reading log file: {FilePath}", info.LogPath);
                return; // Don't retry access denied errors
            }
        }
    }

    private async Task ReadNewLinesAsync(PodInfo info, CancellationToken stoppingToken)
    {
        var filePath = info.LogPath;
        var podSettings = GetPodSettings(info.PodName);
        var deploymentSettings = GetDeploymentSettings(info.DeploymentName);

        if (!File.Exists(filePath))
        {
            _logger.LogWarning("Log file no longer exists: {FilePath}", filePath);
            return;
        }

        // Handle file rotation
        if (deploymentSettings.FilePath != filePath)
        {
            deploymentSettings.FilePath = filePath;
            deploymentSettings.LastReadPosition = 0;
            _logger.LogInformation("New log file detected: {FilePath}", filePath);
        }

        var foundRecent = false;
        var linesProcessed = 0;
        var logLines = new List<LogLine>();
        
        // Multi-line buffering
        LogLine? pendingLogLine = null;
        var multiLineBuffer = new StringBuilder();
        var lastTimestamp = DateTimeOffset.MinValue;

        try
        {
            using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var fileLength = fs.Length;
            var pos = Math.Max(0, Math.Min(deploymentSettings.LastReadPosition, fileLength));

            if (deploymentSettings.LastReadPosition > fileLength)
            {
                _logger.LogInformation("File appears to have been rotated. Resetting position for {FilePath}", filePath);
                pos = 0;
            }

            fs.Seek(pos, SeekOrigin.Begin);
            using var sr = new StreamReader(fs, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 8192);

            string? line;
            while ((line = await sr.ReadLineAsync().ConfigureAwait(false)) != null && !stoppingToken.IsCancellationRequested)
            {
                if (string.IsNullOrWhiteSpace(line))
                    continue;

                // Check if this line is a continuation of the previous log entry
                if (IsLineContinuation(line, info, lastTimestamp))
                {
                    // Add to the buffer for the current pending log entry
                    if (pendingLogLine != null)
                    {
                        multiLineBuffer.AppendLine(line);
                        continue;
                    }
                }

                // If we have a pending log entry, finalize it
                if (pendingLogLine != null)
                {
                    // Append any buffered continuation lines
                    if (multiLineBuffer.Length > 0)
                    {
                        pendingLogLine.Line += Environment.NewLine + multiLineBuffer.ToString().TrimEnd();
                        multiLineBuffer.Clear();
                    }
                    
                    logLines.Add(pendingLogLine);
                    linesProcessed++;
                    
                    // Batch processing to avoid overwhelming the system
                    if (logLines.Count >= 100)
                    {
                        foreach (var logLine in logLines)
                        {
                            _batchingService.AddData(logLine);
                        }
                        logLines.Clear();
                    }
                }

                // Process the new log line
                var processedLine = ProcessLogLine(line, info, podSettings, deploymentSettings, ref foundRecent);
                if (processedLine != null)
                {
                    pendingLogLine = processedLine;
                    lastTimestamp = processedLine.TimeStamp;
                }
                else
                {
                    pendingLogLine = null;
                }
            }

            // Finalize any pending log entry
            if (pendingLogLine != null)
            {
                if (multiLineBuffer.Length > 0)
                {
                    pendingLogLine.Line += Environment.NewLine + multiLineBuffer.ToString().TrimEnd();
                }
                logLines.Add(pendingLogLine);
                linesProcessed++;
            }

            // Process remaining lines
            foreach (var logLine in logLines)
            {
                _batchingService.AddData(logLine);
            }

            deploymentSettings.LastReadPosition = fs.Position;

            if (foundRecent && deploymentSettings.LastDeploymentTime.HasValue)
            {
                deploymentSettings.LastDeploymentTime = null;
                _logger.LogDebug("Reset deployment timestamp for {DeploymentName} after finding recent logs", info.DeploymentName);
            }

            if (linesProcessed > 0)
            {
                _logger.LogDebug("Processed {LinesProcessed} lines from {FilePath}", linesProcessed, filePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading log file {FilePath}", filePath);
            throw;
        }
    }

    private LogLine? ProcessLogLine(string line, PodInfo info, PodSettings podSettings, DeploymentSettings deploymentSettings, ref bool foundRecent)
    {
        // Remove ANSI escape sequences
        var cleanLine = LogParser.RemoveANSIEscapeSequences(line);

        // Parse container format (timestamp stdout/stderr message)
        var processedLine = ParseContainerLogFormat(line, cleanLine);

        var logLevel = GetLogLevelCached(processedLine);
        if (logLevel < podSettings.LogLevel)
        {
            return null;
        }

        var logLine = ParseLogLine(line, processedLine, info.PodName, info.DeploymentName, logLevel);

        logLine.AssignSequenceNumber();
        // Check if this log is recent enough
        if (deploymentSettings.LastDeploymentTime.HasValue)
        {
            var logDateTimeUtc = logLine.TimeStamp.ToUniversalTime();
            var timestampUtc = deploymentSettings.LastDeploymentTime.Value.ToUniversalTime();

            if (logDateTimeUtc < timestampUtc)
            {
                return null;
            }

            foundRecent = true;
        }

        return logLine;
    }

    private string ParseContainerLogFormat(string originalLine, string cleanLine)
    {
        return LogParser.ParseContainerLogFormat(originalLine, cleanLine);
    }

    private LogLevel GetLogLevelCached(string logLine)
    {
        if (string.IsNullOrEmpty(logLine))
            return LogLevel.Any;

        // Clean cache if it gets too large
        if (_logLevelCache.Count > MaxCacheSize)
        {
            var keysToRemove = _logLevelCache.Keys.Take(MaxCacheSize / 2).ToList();
            foreach (var key in keysToRemove)
            {
                _logLevelCache.TryRemove(key, out _);
            }
        }

        // Use first 100 characters for caching to avoid memory issues with very long lines
        var cacheKey = logLine.Length > 100 ? logLine.Substring(0, 100) : logLine;

        return _logLevelCache.GetOrAdd(cacheKey, GetLogLevel);
    }

    private LogLevel GetLogLevel(string logLine)
    {
        if (string.IsNullOrEmpty(logLine))
            return LogLevel.Any;

        var parsedLevel = LogParser.ParseLogLevel(logLine);
        // Parser now returns Any for undetected levels, Information only for explicit INFO logs
        return parsedLevel;
    }

    private LogLine ParseLogLine(string originalLine, string cleanLine, string podName, string deploymentName, LogLevel logLevel)
    {
        var timestamp = ParseTimestamp(originalLine) ?? DateTimeOffset.UtcNow;

        return new LogLine
        {
            DeploymentName = deploymentName,
            PodName = podName,
            Line = cleanLine,
            LogLevel = logLevel,
            TimeStamp = timestamp
        };
    }

    private DateTimeOffset? ParseTimestamp(string line)
    {
        return LogParser.ParseTimestamp(line);
    }

    // TruncateFractionalSeconds moved to LogParser class

    // Helper methods moved to LogParser class
    
    private bool IsLineContinuation(string line, PodInfo info, DateTimeOffset lastTimestamp)
    {
        if (string.IsNullOrWhiteSpace(line))
            return false;
            
        // Parse container format to get the actual log content
        var cleanLine = LogParser.RemoveANSIEscapeSequences(line);
        var processedLine = ParseContainerLogFormat(line, cleanLine);
        
        // Check if line has a timestamp at the beginning
        var timestamp = ParseTimestamp(line);
        if (timestamp.HasValue)
        {
            // If timestamps are very close (within 100ms), it might be a continuation
            var timeDiff = Math.Abs((timestamp.Value - lastTimestamp).TotalMilliseconds);
            if (timeDiff > 100)
                return false;
        }
        
        // Common patterns for continuation lines:
        // 1. Stack trace lines starting with "at "
        if (processedLine.TrimStart().StartsWith("at ", StringComparison.OrdinalIgnoreCase))
            return true;
            
        // 2. Lines starting with whitespace (indented)
        if (processedLine.Length > 0 && char.IsWhiteSpace(processedLine[0]))
            return true;
            
        // 3. Lines that look like stack trace file references
        if (processedLine.Contains("file:///") && processedLine.Contains(".mjs:"))
            return true;
            
        // 4. Lines that are just closing braces or brackets
        if (processedLine.Trim() == "}" || processedLine.Trim() == "]" || processedLine.Trim() == ")")
            return true;
            
        // 5. Lines without any log level indicators
        var logLevel = GetLogLevelCached(processedLine);
        if (logLevel == LogLevel.Any && !timestamp.HasValue)
        {
            // No log level and no timestamp - likely a continuation
            return true;
        }
        
        return false;
    }

    public override void Dispose()
    {

        foreach (var watcher in _watchers)
        {
            try
            {
                watcher?.Dispose();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing file watcher");
            }
        }

        _fileSemaphore?.Dispose();


        base.Dispose();
    }
    private async Task ProcessEventLogFileAsync(string filePath, CancellationToken stoppingToken)
    {
        try
        {
            await _fileSemaphore.WaitAsync(stoppingToken).ConfigureAwait(false);

            // Extract log name from file path for tracking
            var logName = Path.GetFileNameWithoutExtension(filePath);
            // machine hostname

            var machine = Environment.MachineName;
            var deploymentSettings = GetDeploymentSettings($"{machine}-{logName}");

            // Handle file rotation/changes
            if (deploymentSettings.FilePath != filePath)
            {
                deploymentSettings.FilePath = filePath;
                deploymentSettings.LastReadPosition = 0;
                _logger.LogInformation("New event log file detected: {FilePath}", filePath);
            }

            var logLines = new List<LogLine>();
            var eventsProcessed = 0;
            var lastRecordId = deploymentSettings.LastReadPosition;

            using (var eventLog = new EventLogReader(filePath, PathType.FilePath))
            {
                EventRecord? eventRecord;
                var currentRecordId = 0L;

                // Read through events
                while ((eventRecord = eventLog.ReadEvent()) != null && !stoppingToken.IsCancellationRequested)
                {
                    using (eventRecord)
                    {
                        currentRecordId = eventRecord.RecordId ?? 0;

                        // Skip events we've already processed
                        if (currentRecordId <= lastRecordId)
                            continue;

                        var logLine = ConvertEventRecordToLogLine(eventRecord, logName);
                        if (logLine != null)
                        {
                            // Apply log level filtering
                            var podSettings = GetPodSettings(logLine.PodName);
                            if (logLine.LogLevel >= podSettings.LogLevel)
                            {
                                if (logLine.TimeStamp < DateTimeOffset.UtcNow.AddDays(-_maxDaysOld))
                                {
                                    //   _logger.LogDebug("Skipping old event log entry: {TimeStamp} for {PodName}", logLine.TimeStamp, logLine.PodName);
                                    continue; // Skip old entries
                                }
                                logLines.Add(logLine);
                                eventsProcessed++;

                                // Batch processing
                                if (logLines.Count >= 50) // Smaller batch for event logs
                                {
                                    foreach (var line in logLines)
                                    {
                                        _batchingService.AddData(line);
                                    }
                                    logLines.Clear();
                                }
                            }
                        }

                        // Update last processed record ID
                        deploymentSettings.LastReadPosition = currentRecordId;
                    }
                }

                // Process remaining lines
                foreach (var logLine in logLines)
                {
                    _batchingService.AddData(logLine);
                }

                if (eventsProcessed > 0)
                {
                    _logger.LogDebug("Processed {EventsProcessed} events from {FilePath}", eventsProcessed, filePath);
                }
            }
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogError(ex, "Access denied reading event log file: {FilePath}", filePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing event log file: {FilePath}", filePath);
        }
        finally
        {
            _fileSemaphore.Release();
        }
    }

    private LogLine? ConvertEventRecordToLogLine(EventRecord eventRecord, string logName)
    {
        try
        {


            var logLevel = MapEventLevelToLogLevel(eventRecord.Level);
            var machine = Environment.MachineName;
            // Build the log message
            var message = BuildEventLogMessage(eventRecord);
            var logname = eventRecord.LogName ?? logName;
            var logLine = new LogLine
            {
                DeploymentName = machine,
                PodName = $"{machine}-{logname}",
                Line = message,
                LogLevel = logLevel,
                TimeStamp = eventRecord.TimeCreated ?? DateTimeOffset.UtcNow
            };

            logLine.AssignSequenceNumber();
            return logLine;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to convert event record to log line for event ID: {EventId}",
                eventRecord.Id);
            return null;
        }
    }

    private string BuildEventLogMessage(EventRecord eventRecord)
    {
        var sb = new StringBuilder();

        // Add basic event information
        sb.Append($"EventID: {eventRecord.Id}");

        try
        {
            if (!string.IsNullOrEmpty(eventRecord.TaskDisplayName))
                sb.Append($" | Task: {eventRecord.TaskDisplayName}");
        }
        catch
        {

        }
        try
        {
            if (!string.IsNullOrEmpty(eventRecord.ProviderName))
                sb.Append($" | Source: {eventRecord.ProviderName}");
        }
        catch
        {

        }

        // Add the main message
        try
        {
            var description = eventRecord.FormatDescription();
            if (!string.IsNullOrEmpty(description))
            {
                sb.Append($" | Message: {description.Replace('\r', ' ').Replace('\n', ' ')}");
            }
        }
        catch (Exception)
        {
            // If we can't format the description, try to get raw data
            if (eventRecord.Properties?.Count > 0)
            {
                var properties = string.Join(", ",
                    eventRecord.Properties.Take(5).Select(p => p.Value?.ToString() ?? "null"));
                sb.Append($" | Data: {properties}");
            }
        }

        return sb.ToString();
    }

    private LogLevel MapEventLevelToLogLevel(byte? eventLevel)
    {
        return eventLevel switch
        {
            1 => LogLevel.Error,      // Critical
            2 => LogLevel.Error,      // Error  
            3 => LogLevel.Warning,    // Warning
            4 => LogLevel.Information, // Information
            5 => LogLevel.Debug,      // Verbose
            0 => LogLevel.Information, // LogAlways
            _ => LogLevel.Any
        };
    }
}

// Supporting classes remain mostly the same with minor improvements
public class PodInfo
{
    public string DeploymentName { get; }
    public string PodName { get; }
    public string LogPath { get; }

    public PodInfo(string logPath)
    {
        LogPath = logPath ?? throw new ArgumentNullException(nameof(logPath));

        try
        {
            var parts = logPath.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 3)
            {
                throw new ArgumentException($"Invalid log path format: {logPath}");
            }

            PodName = parts[^2]; // Second to last part
            DeploymentName = parts[^3]; // Third to last part
        }
        catch (Exception ex)
        {
            throw new ArgumentException($"Failed to parse log path: {logPath}", ex);
        }
    }

}

public class LogWatcherOptions
{
    public List<string> IgnorePods { get; set; } = new();
    public List<string> Paths { get; set; } = new();
    public Dictionary<string, LogLevel> LogLevel { get; set; } = new();
    public List<string> FilePatterns { get; set; } = new() { "*.log" };
    public int MaxDaysOld { get; set; } = 30; // Default to 30 days old logs
}

public class PodSettings
{
    public LogLevel LogLevel { get; set; }
    public bool Ignore { get; set; }
}

public class DeploymentSettings
{
    public string? FilePath { get; set; }
    public long LastReadPosition { get; set; }
    public DateTime? LastDeploymentTime { get; set; }
}
