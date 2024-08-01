using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace LogMkAgent.Services;
public class LogWatcher : BackgroundService
{

    private readonly List<string> _logPaths;
    private readonly List<FileSystemWatcher> _watchers = new List<FileSystemWatcher>();
    private readonly Dictionary<string, long> _lastReadPositions = new Dictionary<string, long>();
    private readonly BatchingService _batchingService;
    private readonly HashSet<string> _ignorePods = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    private readonly LogLevel DefaultLogLevel = LogLevel.INFO;
    public LogWatcher(BatchingService batchingService, IOptions<LogWatcherOptions> options)
    {
        _logPaths = options.Value.Paths;
        if (_logPaths == null || _logPaths.Count == 0)
        {
            throw new ArgumentException("At least one log path must be specified");
        }
        foreach (var pod in options.Value?.IgnorePods)
        {
            _ignorePods.Add(pod);
        }
        _batchingService = batchingService;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        foreach (var path in _logPaths)
        {
            Console.WriteLine("Watching " + path);
            var watcher = new FileSystemWatcher
            {
                Path = path,
                Filter = "*.log",
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.LastAccess,
            };

            watcher.Changed += OnLogChanged;
            watcher.Created += OnLogCreated;
            watcher.EnableRaisingEvents = true;
            watcher.IncludeSubdirectories = true;
            watcher.Error += (sender, e) =>
            {
                Console.WriteLine($"Error in file watcher: {e.GetException().Message}");
            };
            _watchers.Add(watcher);
        }


        stoppingToken.Register(() => _watchers.ForEach(w => w.Dispose()));

        return Task.CompletedTask; // Task completes only when the service is stopped.
    }

    private void OnLogCreated(object sender, FileSystemEventArgs e)
    {
        _lastReadPositions[e.FullPath] = 0; // Reset or initialize position for new files
        ReadNewLines(new PodInfo(e.FullPath));
    }

    private void OnLogChanged(object sender, FileSystemEventArgs e)
    {
        ReadNewLines(new PodInfo(e.FullPath));
    }
    private void ReadNewLines(PodInfo info)
    {
        if (_ignorePods.Contains(info.PodName))
            return;

        var filePath = info.LogPath;

        if (!_lastReadPositions.ContainsKey(filePath))
        {
            _lastReadPositions[filePath] = 0;
        }

        try
        {
            using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                fs.Seek(_lastReadPositions[filePath], SeekOrigin.Begin);
                using (var sr = new StreamReader(fs))
                {

                    string line;
                    while ((line = sr.ReadLine()) != null)
                    {
                        if (string.IsNullOrWhiteSpace(line))
                            continue;
                        var logLevel = GetLogLevel(line);
                        if (logLevel < DefaultLogLevel)
                        {
                            continue;
                        }
                        var logLine = ParseLogLine(line, info.PodName, info.DeploymentName, logLevel);
                        Console.WriteLine(JsonSerializer.Serialize(logLine)); // Or process as needed
                    }
                    _lastReadPositions[filePath] = fs.Position; // Update the last read position
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error reading log file {filePath}: {ex.Message}");
        }
    }

    private LogLine ParseLogLine(string line, string podName, string deploymentName, LogLevel logLevel)
    {



        //  var match = timeStampeRegex.Match(line);
        //  var timestamp = DateTime.ParseExact(match.Groups["timestamp"].Value, "yyyy-MM-dd HH:mm:ss,fff", CultureInfo.InvariantCulture);
        var firstSpace = line.IndexOf(' ');
        if (firstSpace >= 0)
        {
            var dt = line.Substring(0, firstSpace);
            dt = TruncateFractionalSeconds(dt, 7);
            if (DateTime.TryParseExact(dt, "yyyy-MM-ddTHH:mm:ss.fffffffZ", CultureInfo.InvariantCulture, DateTimeStyles.None, out var timestamp))
            {
                var secondSpace = line.IndexOf(' ', firstSpace + 1);
                var thirdSpace = line.IndexOf(' ', secondSpace + 1);

                var outType = line.Substring(firstSpace + 1, secondSpace - firstSpace - 1);
                if (outType == "stdout" || outType == "stderr")
                {
                    line = line.Substring(thirdSpace + 1);
                }
                return new LogLine(deploymentName, podName, line, logLevel, timestamp);
            }
        }
        return new LogLine(deploymentName, podName, line, logLevel, DateTime.Now);

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
        if (logLine.Contains("ERROR", StringComparison.OrdinalIgnoreCase) || logLine.Contains("stderr", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.ERROR;
        }
        else if (logLine.Contains("WARN", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.WARN;
        }
        else if (logLine.Contains("INFO", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.INFO;
        }
        else if (logLine.Contains("DEBUG", StringComparison.OrdinalIgnoreCase))
        {
            return LogLevel.DEBUG;
        }
        return LogLevel.ANY;
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
public class LogLine
{
    public string DeploymentName { get; set; }
    public string PodName { get; set; }
    public string Line { get; set; }
    public LogLevel LogLevel { get; set; }
    public DateTime TimeStamp { get; set; }
    public LogLine(string deploymentName, string podName, string line, LogLevel logLevel, DateTime timeStamp)
    {
        DeploymentName = deploymentName;
        PodName = podName;
        Line = line;
        LogLevel = logLevel;
        TimeStamp = timeStamp;
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

    public Dictionary<string, string> LogLevel { get; set; } = new Dictionary<string, string>();

}

public enum LogLevel
{
    ANY = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4

}