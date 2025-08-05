using ServiceStack.DataAnnotations;

namespace LogMkApi.Data.Models;

public class WorkQueue
{
    [AutoIncrement]
    public int Id { get; set; }
    
    [Required]
    [Index]
    public string Type { get; set; } = string.Empty;
    
    [Required]
    [Index]
    public string Status { get; set; } = "PENDING";
    
    [Index]
    public string? PodName { get; set; }
    
    public string? Deployment { get; set; }
    
    public string? TimeRange { get; set; }
    
    [Required]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime? StartedAt { get; set; }
    
    public DateTime? CompletedAt { get; set; }
    
    public string? ErrorMessage { get; set; }
    
    public int? RecordsAffected { get; set; }
    
    public int? EstimatedRecords { get; set; }
    
    public int Progress { get; set; } = 0;
    
    public string? CreatedBy { get; set; }
    
    // Additional metadata as JSON
    public string? Metadata { get; set; }
}

public static class WorkQueueStatus
{
    public const string Pending = "PENDING";
    public const string InProgress = "IN_PROGRESS";
    public const string Completed = "COMPLETED";
    public const string Failed = "FAILED";
    public const string Cancelled = "CANCELLED";
}

public static class WorkQueueType
{
    public const string LogPurge = "LOG_PURGE";
}