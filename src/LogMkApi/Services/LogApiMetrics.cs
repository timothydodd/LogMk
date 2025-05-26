using System.Collections.Concurrent;

namespace LogMkApi.Services;

// Metrics service for monitoring
public class LogApiMetrics
{
    private long _logsReceived;
    private long _logsProcessed;
    private readonly ConcurrentDictionary<string, long> _errors = new();

    public void IncrementLogsReceived(int count) => Interlocked.Add(ref _logsReceived, count);
    public void IncrementLogsProcessed(int count) => Interlocked.Add(ref _logsProcessed, count);
    public void IncrementErrors(string errorType, int count = 1) => _errors.AddOrUpdate(errorType, count, (k, v) => v + count);

    public LogApiMetricsSnapshot GetMetrics() => new()
    {
        LogsReceived = _logsReceived,
        LogsProcessed = _logsProcessed,
        SuccessRate = _logsReceived > 0 ? (double)_logsProcessed / _logsReceived : 1.0,
        TotalErrors = _errors.Values.Sum(),
        ErrorBreakdown = _errors.ToDictionary(kvp => kvp.Key, kvp => kvp.Value),
        Timestamp = DateTimeOffset.UtcNow
    };
}

public class LogApiMetricsSnapshot
{
    public long LogsReceived { get; set; }
    public long LogsProcessed { get; set; }
    public double SuccessRate { get; set; }
    public long TotalErrors { get; set; }
    public Dictionary<string, long> ErrorBreakdown { get; set; } = new();
    public DateTimeOffset Timestamp { get; set; }
}
