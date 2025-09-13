using Dapper;
using LogMkApi.Data.Models;
using LogMkCommon;
using RoboDodd.OrmLite;

namespace LogMkApi.Data;

public class WorkQueueRepo
{
    private readonly DbConnectionFactory _dbFactory;
    private readonly ILogger<WorkQueueRepo> _logger;

    public WorkQueueRepo(DbConnectionFactory dbFactory, ILogger<WorkQueueRepo> logger)
    {
        _dbFactory = dbFactory;
        _logger = logger;
    }

    public async Task<WorkQueue> CreateAsync(WorkQueue item)
    {
        using var db = _dbFactory.CreateConnection();
        item.CreatedAt = DateTime.UtcNow;
        item.Status = WorkQueueStatus.Pending;
        var id = await db.InsertAsync(item, selectIdentity: true);
        item.Id = (int)id;
        return item;
    }

    public async Task<WorkQueue?> GetByIdAsync(int id)
    {
        using var db = _dbFactory.CreateConnection();
        return await db.SingleByIdAsync<WorkQueue>(id);
    }

    public async Task<List<WorkQueue>> GetAllAsync(int? limit = null)
    {
        using var db = _dbFactory.CreateConnection();
        var query = db.From<WorkQueue>()
            .OrderByDescending(x => x.CreatedAt);

        if (limit.HasValue)
            query.Limit(limit.Value);

        return await db.SelectAsync(query);
    }

    public async Task<List<WorkQueue>> GetActiveAsync()
    {
        using var db = _dbFactory.CreateConnection();
        return await db.SelectAsync<WorkQueue>(x =>
            x.Status == WorkQueueStatus.Pending ||
            x.Status == WorkQueueStatus.InProgress);
    }

    public async Task<WorkQueue?> GetNextPendingAsync()
    {
        using var db = _dbFactory.CreateConnection();
        var query = db.From<WorkQueue>()
            .Where(x => x.Status == WorkQueueStatus.Pending)
            .OrderBy(x => x.CreatedAt)
            .Limit(1);

        var results = await db.SelectAsync(query);
        return results.FirstOrDefault();
    }

    public async Task<bool> HasPendingOrActiveForPodAsync(string podName)
    {
        using var db = _dbFactory.CreateConnection();
        return await db.ExistsAsync<WorkQueue>(x =>
            x.PodName == podName &&
            (x.Status == WorkQueueStatus.Pending || x.Status == WorkQueueStatus.InProgress));
    }

    public async Task<List<WorkQueue>> GetByPodAsync(string podName)
    {
        using var db = _dbFactory.CreateConnection();
        return await db.SelectAsync<WorkQueue>(x => x.PodName == podName);
    }

    public async Task UpdateStatusAsync(int id, string status, DateTime? startedAt = null, DateTime? completedAt = null)
    {
        using var db = _dbFactory.CreateConnection();

        if (startedAt.HasValue && completedAt.HasValue)
        {
            await db.UpdateOnlyAsync(() => new WorkQueue
            {
                Status = status,
                StartedAt = startedAt.Value,
                CompletedAt = completedAt.Value
            }, x => x.Id == id);
        }
        else if (startedAt.HasValue)
        {
            await db.UpdateOnlyAsync(() => new WorkQueue
            {
                Status = status,
                StartedAt = startedAt.Value
            }, x => x.Id == id);
        }
        else if (completedAt.HasValue)
        {
            await db.UpdateOnlyAsync(() => new WorkQueue
            {
                Status = status,
                CompletedAt = completedAt.Value
            }, x => x.Id == id);
        }
        else
        {
            await db.UpdateOnlyAsync(() => new WorkQueue
            {
                Status = status
            }, x => x.Id == id);
        }
    }

    public async Task UpdateProgressAsync(int id, int progress, int? recordsAffected = null)
    {
        using var db = _dbFactory.CreateConnection();

        if (recordsAffected.HasValue)
        {
            await db.UpdateOnlyAsync(() => new WorkQueue
            {
                Progress = progress,
                RecordsAffected = recordsAffected.Value
            }, x => x.Id == id);
        }
        else
        {
            await db.UpdateOnlyAsync(() => new WorkQueue
            {
                Progress = progress
            }, x => x.Id == id);
        }
    }

    public async Task UpdateErrorAsync(int id, string errorMessage)
    {
        using var db = _dbFactory.CreateConnection();
        await db.UpdateOnlyAsync(() => new WorkQueue
        {
            Status = WorkQueueStatus.Failed,
            ErrorMessage = errorMessage,
            CompletedAt = DateTime.UtcNow
        }, x => x.Id == id);
    }

    public async Task<bool> CancelAsync(int id)
    {
        using var db = _dbFactory.CreateConnection();
        var rowsAffected = await db.UpdateOnlyAsync(() => new WorkQueue
        {
            Status = WorkQueueStatus.Cancelled,
            CompletedAt = DateTime.UtcNow
        }, x => x.Id == id && x.Status == WorkQueueStatus.Pending);

        return rowsAffected > 0;
    }

    public async Task<WorkQueueStatusResponse> GetStatusSummaryAsync()
    {
        using var db = _dbFactory.CreateConnection();
        var query = @"
            SELECT 
                COUNT(CASE WHEN Status = @pending THEN 1 END) as PendingCount,
                COUNT(CASE WHEN Status = @inProgress THEN 1 END) as ActiveCount,
                COUNT(CASE WHEN Status = @completed THEN 1 END) as CompletedCount,
                COUNT(CASE WHEN Status = @failed THEN 1 END) as FailedCount
            FROM WorkQueue";

        var parameters = new DynamicParameters();
        parameters.Add("pending", WorkQueueStatus.Pending);
        parameters.Add("inProgress", WorkQueueStatus.InProgress);
        parameters.Add("completed", WorkQueueStatus.Completed);
        parameters.Add("failed", WorkQueueStatus.Failed);

        var result = await db.QuerySingleAsync<WorkQueueStatusResponse>(query, parameters);

        // Get recent items
        var recentItems = await GetAllAsync(50);
        result.Items = recentItems.Select(MapToResponse).ToList();

        return result;
    }

    public async Task<int> EstimateRecordsAsync(string podName, string? timeRange)
    {
        using var db = _dbFactory.CreateConnection();

        DateTime? startDate = null;
        switch (timeRange?.ToLower())
        {
            case "hour":
                startDate = DateTime.UtcNow.AddHours(-1);
                break;
            case "day":
                startDate = DateTime.UtcNow.AddDays(-1);
                break;
            case "week":
                startDate = DateTime.UtcNow.AddDays(-7);
                break;
            case "month":
                startDate = DateTime.UtcNow.AddMonths(-1);
                break;
        }

        var query = db.From<Log>().Where(x => x.Pod == podName);
        if (startDate.HasValue)
            query.And(x => x.TimeStamp >= startDate.Value);

        return (int)await db.CountAsync(query);
    }

    private WorkQueueItemResponse MapToResponse(WorkQueue item)
    {
        return new WorkQueueItemResponse
        {
            Id = item.Id,
            Type = item.Type,
            Status = item.Status,
            PodName = item.PodName,
            Deployment = item.Deployment,
            TimeRange = item.TimeRange,
            CreatedAt = item.CreatedAt,
            StartedAt = item.StartedAt,
            CompletedAt = item.CompletedAt,
            ErrorMessage = item.ErrorMessage,
            RecordsAffected = item.RecordsAffected,
            EstimatedRecords = item.EstimatedRecords,
            Progress = item.Progress,
            CreatedBy = item.CreatedBy
        };
    }
}
