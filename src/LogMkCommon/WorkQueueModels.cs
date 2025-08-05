namespace LogMkCommon;

public class WorkQueueItem
{
    public int Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? PodName { get; set; }
    public string? Deployment { get; set; }
    public string? TimeRange { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? ErrorMessage { get; set; }
    public int? RecordsAffected { get; set; }
    public int? EstimatedRecords { get; set; }
    public int Progress { get; set; }
    public string? CreatedBy { get; set; }
}

public class CreateWorkQueueItemRequest
{
    public string Type { get; set; } = string.Empty;
    public string? PodName { get; set; }
    public string? Deployment { get; set; }
    public string? TimeRange { get; set; }
    public Dictionary<string, object>? Metadata { get; set; }
}

public class WorkQueueItemResponse : WorkQueueItem
{
    public TimeSpan? ElapsedTime => StartedAt.HasValue ? 
        (CompletedAt ?? DateTime.UtcNow) - StartedAt.Value : null;
    
    public double? EstimatedTimeRemaining
    {
        get
        {
            if (!StartedAt.HasValue || Progress <= 0 || Progress >= 100)
                return null;
                
            var elapsed = (DateTime.UtcNow - StartedAt.Value).TotalSeconds;
            var rate = Progress / elapsed;
            var remaining = (100 - Progress) / rate;
            return remaining;
        }
    }
}

public class WorkQueueStatusResponse
{
    public List<WorkQueueItemResponse> Items { get; set; } = new();
    public int PendingCount { get; set; }
    public int ActiveCount { get; set; }
    public int CompletedCount { get; set; }
    public int FailedCount { get; set; }
}

public class WorkQueueProgressUpdate
{
    public int Id { get; set; }
    public string Status { get; set; } = string.Empty;
    public int Progress { get; set; }
    public int? RecordsAffected { get; set; }
    public string? ErrorMessage { get; set; }
}