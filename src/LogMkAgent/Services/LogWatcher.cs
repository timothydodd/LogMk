using Microsoft.Extensions.Options;

namespace LogMkAgent.Services;
public class LogWatcher : BackgroundService
{

    private readonly List<string> _logPaths;
    private readonly List<FileSystemWatcher> _watchers = new List<FileSystemWatcher>();
    private readonly Dictionary<string, long> _lastReadPositions = new Dictionary<string, long>();
    private readonly BatchingService _batchingService;


    public LogWatcher(BatchingService batchingService, IOptions<LogWatcherOptions> options)
    {
        _logPaths = options.Value.Paths;
        if (_logPaths == null || _logPaths.Count == 0)
        {
            throw new ArgumentException("At least one log path must be specified");
        }
        _batchingService = batchingService;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        foreach (var path in _logPaths)
        {
            var watcher = new FileSystemWatcher
            {
                Path = path,
                Filter = "*.log",
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName
            };

            watcher.Changed += OnLogChanged;
            watcher.Created += OnLogCreated;
            watcher.EnableRaisingEvents = true;
            _watchers.Add(watcher);
        }

        Console.WriteLine("Monitoring logs on multiple paths...");

        stoppingToken.Register(() => _watchers.ForEach(w => w.Dispose()));

        return Task.CompletedTask; // Task completes only when the service is stopped.
    }

    private void OnLogCreated(object sender, FileSystemEventArgs e)
    {
        _lastReadPositions[e.FullPath] = 0; // Reset or initialize position for new files
        ReadNewLines(e.FullPath);
    }

    private void OnLogChanged(object sender, FileSystemEventArgs e)
    {
        ReadNewLines(e.FullPath);
    }
    private void ReadNewLines(string filePath)
    {
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
                        Console.WriteLine(line); // Or process as needed
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

    public override void Dispose()
    {
        foreach (var watcher in _watchers)
        {
            watcher.Dispose();
        }
        base.Dispose();
    }
}
public class LogWatcherOptions
{
    public List<string> Paths { get; set; } = new List<string>();
}
