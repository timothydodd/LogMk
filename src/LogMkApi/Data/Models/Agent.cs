using RoboDodd.OrmLite;
using System.ComponentModel.DataAnnotations;

namespace LogMkApi.Data.Models;

public class AgentRecord
{
    [PrimaryKey]
    [MaxLength(100)]
    public string AgentId { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Hostname { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Version { get; set; }

    [MaxLength(64)]
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

    [MaxLength(20)]
    public string? CircuitBreakerState { get; set; }
}

public class AgentConfigRecord
{
    [PrimaryKey]
    [MaxLength(100)]
    public string AgentId { get; set; } = string.Empty;

    [CustomField("TEXT")]
    public string ConfigJson { get; set; } = "{}";

    public DateTime UpdatedAt { get; set; }

    [MaxLength(100)]
    public string? UpdatedBy { get; set; }
}
