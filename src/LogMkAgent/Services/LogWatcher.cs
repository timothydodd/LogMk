using System.Globalization;
using System.Text.Json;
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
    private readonly Dictionary<string, PodSettings> _podSettings = new Dictionary<string, PodSettings>(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, DeploymentSettings> _deploymentSettings = new Dictionary<string, DeploymentSettings>(StringComparer.OrdinalIgnoreCase);
    private readonly LogLevel DefaultLogLevel = LogLevel.Information;

    public LogWatcher(BatchingService batchingService, IOptions<LogWatcherOptions> options, LogApiClient client, ILogger<LogWatcher> logger)
    {
        _batchingService = batchingService;
        _logger = logger;
        _logPaths = options.Value.Paths;
        if (_logPaths == null || _logPaths.Count == 0)
        {
            _logger.LogError("At least one log path must be specified");
            throw new ArgumentException("At least one log path must be specified");
        }
        if (options.Value.LogLevel.TryGetValue("Default", out var defaultLevel))
        {
            _logger.LogInformation($"Setting default log level to {defaultLevel}");
            DefaultLogLevel = defaultLevel;
        }
        foreach (var p in options.Value.LogLevel)
        {
            var podSettings = GetPodSettings(p.Key);
            podSettings.LogLevel = p.Value;
        }
        foreach (var pod in options.Value?.IgnorePods)
        {
            var getPod = GetPodSettings(pod);
            getPod.Ignore = true;
        }
        var times = client.GetDataAsync<List<LatestDeploymentEntry>>("api/log/times").GetAwaiter().GetResult();
        if (times != null)
        {
            _logger.LogInformation("Got latest deployment times");
            foreach (var pod in times)
            {
                var s = GetDeploymentSettings(pod.Deployment);
                s.LastDeploymentTime = pod.TimeStamp;
                _logger.LogInformation($"Deployment {pod.Deployment} last wrote at {pod.TimeStamp}");
            }
        }


    }

    private PodSettings GetPodSettings(string podName)
    {
        if (_podSettings.TryGetValue(podName, out var settings))
        {
            return settings;
        }
        var p = new PodSettings() { LogLevel = DefaultLogLevel, Ignore = false };
        _podSettings.Add(podName, p);
        return p;
    }
    private DeploymentSettings GetDeploymentSettings(string deploymentName)
    {
        if (_deploymentSettings.TryGetValue(deploymentName, out var settings))
        {
            return settings;
        }
        var d = new DeploymentSettings() { LastDeploymentTime = null };
        _deploymentSettings.Add(deploymentName, d);
        return d;
    }
    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        foreach (var path in _logPaths)
        {
            _logger.LogInformation($"Watching {path}");
            var watcher = new FileSystemWatcher
            {
                Path = path,
                Filter = "*.log",
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size,
            };

            watcher.Changed += OnLogChanged;
            watcher.Created += OnLogCreated;
            watcher.EnableRaisingEvents = true;
            watcher.IncludeSubdirectories = true;
            watcher.Error += (sender, e) =>
            {
                _logger.LogError($"Error in file watcher: {e.GetException().Message}");
            };
            _watchers.Add(watcher);
        }


        stoppingToken.Register(() => _watchers.ForEach(w => w.Dispose()));

        return Task.CompletedTask; // Task completes only when the service is stopped.
    }

    private void OnLogCreated(object sender, FileSystemEventArgs e)
    {
        ReadNewLines(new PodInfo(e.FullPath));
    }

    private void OnLogChanged(object sender, FileSystemEventArgs e)
    {
        ReadNewLines(new PodInfo(e.FullPath));
    }
    private void ReadNewLines(PodInfo info)
    {
        var podSettings = GetPodSettings(info.PodName);

        if (podSettings.Ignore)
            return;

        var filePath = info.LogPath;
        var podLogLevel = podSettings.LogLevel;
        var deploymentSettings = GetDeploymentSettings(info.DeploymentName);

        if (deploymentSettings.FilePath != filePath)
        {
            deploymentSettings.FilePath = filePath;
            deploymentSettings.LastReadPosition = 0;
            _logger.LogInformation($"New log file detected: {filePath}");
        }
        DateTime? timeStamp = deploymentSettings.LastDeploymentTime;

        var foundRecent = false;
        try
        {
            using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read))
            {
                fs.Seek(deploymentSettings.LastReadPosition, SeekOrigin.Begin);
                using (var sr = new StreamReader(fs))
                {

                    string line;
                    while ((line = sr.ReadLine()) != null)
                    {
                        if (string.IsNullOrWhiteSpace(line))
                            continue;
                        var logLevel = GetLogLevel(line);
                        if (logLevel < podLogLevel)
                        {
                            continue;
                        }
                        var logLine = ParseLogLine(line, info.PodName, info.DeploymentName, logLevel);

                        if (timeStamp.HasValue)
                        {
                            var logDateTimeUtc = logLine.TimeStamp.ToUniversalTime();
                            var timestampUtc = timeStamp.Value.ToUniversalTime();

                            if (logDateTimeUtc < timestampUtc)
                                continue;

                            foundRecent = true;
                        }
                        _batchingService.AddData(logLine);
                    }
                    deploymentSettings.LastReadPosition = fs.Position; // Update the last read position
                }
            }
            if (foundRecent)
            {
                timeStamp = null;
                deploymentSettings.LastDeploymentTime = null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error reading log file {filePath}: {ex.Message}");
        }
    }

    private LogLine ParseLogLine(string line, string podName, string deploymentName, LogLevel logLevel)
    {

        var firstSpace = line.IndexOf(' ');
        if (firstSpace >= 0)
        {
            var dt = line.Substring(0, firstSpace);
            dt = TruncateFractionalSeconds(dt, 7);
            if (DateTimeOffset.TryParseExact(dt, "yyyy-MM-ddTHH:mm:ss.fffffffZ", CultureInfo.InvariantCulture, DateTimeStyles.None, out var timestamp))
            {
                var secondSpace = line.IndexOf(' ', firstSpace + 1);
                var thirdSpace = line.IndexOf(' ', secondSpace + 1);

                var outType = line.Substring(firstSpace + 1, secondSpace - firstSpace - 1);
                if (outType == "stdout" || outType == "stderr")
                {
                    line = line.Substring(thirdSpace + 1);
                }
                return new LogLine() { DeploymentName = deploymentName, PodName = podName, Line = line, LogLevel = logLevel, TimeStamp = timestamp };
            }
        }
        return new LogLine() { DeploymentName = deploymentName, PodName = podName, Line = line, LogLevel = logLevel, TimeStamp = DateTimeOffset.UtcNow };

    }
    static string TruncateFractionalSeconds(string timestamp, int maxFractionalDigits)
    {
        int dotIndex = timestamp.IndexOf('.');
        if (dotIndex == -1)
            return timestamp; // No fractional seconds present

        int endIndex = dotIndex + maxFractionalDigits + 1; // +1 for the dot
        if (endIndex >= timestamp.Length - 1)
            return timestamp; // No truncation needed

        return timestamp.Substring(0, endIndex) + "Z";
    }
    private LogLevel GetLogLevel(string logLine)
    {
        if (logLine.Contains("ERROR", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.Error;
        }
        else if (logLine.Contains("WARN", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.Warning;
        }
        else if (logLine.Contains("INFO", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.Information;
        }
        else if (logLine.Contains("DEBUG", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.Debug;
        }
        return LogLevel.Any;
    }
    public override void Dispose()
    {
        foreach (var watcher in _watchers)
        {
            watcher.Dispose();
        }
        base.Dispose();
    }
}

public class PodInfo
{
    public string DeploymentName { get; set; }
    public string PodName { get; set; }
    public string LogPath { get; set; }

    public PodInfo(string logPath)
    {
        LogPath = logPath;
        var parts = logPath.Split(Path.DirectorySeparatorChar);
        PodName = parts[parts.Length - 2];
        DeploymentName = parts[parts.Length - 3];
    }
}
public class LogWatcherOptions
{
    public List<string> IgnorePods { get; set; } = new List<string>();
    public List<string> Paths { get; set; } = new List<string>();

    public Dictionary<string, LogLevel> LogLevel { get; set; } = new Dictionary<string, LogLevel>();

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