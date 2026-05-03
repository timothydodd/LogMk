namespace LogMkCommon;

public class AgentHeartbeat
{
    public string AgentId { get; set; } = string.Empty;
    public string Hostname { get; set; } = string.Empty;
    public string? Version { get; set; }
    public string? IpAddress { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? LastBatchSentAt { get; set; }
    public int QueuedItems { get; set; }
    public long TotalItemsProcessed { get; set; }
    public long TotalBatchesSent { get; set; }
    public long TotalFailures { get; set; }
    public long TotalDropped { get; set; }
    public string? CircuitBreakerState { get; set; }
}

public class AgentInfo
{
    public string AgentId { get; set; } = string.Empty;
    public string Hostname { get; set; } = string.Empty;
    public string? Version { get; set; }
    public string? IpAddress { get; set; }
    public DateTime FirstSeenAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? LastBatchSentAt { get; set; }
    public int QueuedItems { get; set; }
    public long TotalItemsProcessed { get; set; }
    public long TotalBatchesSent { get; set; }
    public long TotalFailures { get; set; }
    public long TotalDropped { get; set; }
    public string? CircuitBreakerState { get; set; }

    public bool IsOnline => (DateTime.UtcNow - LastSeenAt) < TimeSpan.FromMinutes(2);
}

public class AgentConfig
{
    public string AgentId { get; set; } = string.Empty;

    // Log filtering — stored as string names ("Information", "Warning", ...) so the
    // wire format is human-readable and survives without a custom enum converter.
    public string DefaultLogLevel { get; set; } = "Information";
    public Dictionary<string, string> PodLogLevels { get; set; } = new();
    public List<string> IgnoredPods { get; set; } = new();

    public static LogLevel ParseLogLevel(string? value, LogLevel fallback = LogLevel.Information) =>
        Enum.TryParse<LogLevel>(value, ignoreCase: true, out var parsed) ? parsed : fallback;

    // Watcher
    public int MaxDaysOld { get; set; } = 30;
    public int MaxLineLength { get; set; } = 10000;

    // Batching
    public int MaxBatchSize { get; set; } = 500;
    public int MaxBatchesPerMinute { get; set; } = 120;
    public int MaxQueueSize { get; set; } = 50000;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}
