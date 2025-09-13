using System.Text;
using Dapper;
using LogMkApi.Data;
using LogMkApi.Data.Models;
using LogMkApi.Hubs;
using LogMkCommon;
using Microsoft.AspNetCore.SignalR;
using RoboDodd.OrmLite;

namespace LogMkApi.Services;

public class WorkQueueProcessorService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<WorkQueueProcessorService> _logger;
    private readonly TimeSpan _pollInterval = TimeSpan.FromSeconds(30);
    private readonly TimeSpan _dbTimeout = TimeSpan.FromHours(1);

    public WorkQueueProcessorService(IServiceProvider serviceProvider, ILogger<WorkQueueProcessorService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("WorkQueueProcessorService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessNextItem(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in WorkQueueProcessorService");
            }

            await Task.Delay(_pollInterval, stoppingToken);
        }

        _logger.LogInformation("WorkQueueProcessorService stopped");
    }

    private async Task ProcessNextItem(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var workQueueRepo = scope.ServiceProvider.GetRequiredService<WorkQueueRepo>();
        var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<LogHub>>();

        var item = await workQueueRepo.GetNextPendingAsync();
        if (item == null)
            return;

        _logger.LogInformation("Processing work queue item {Id} of type {Type}", item.Id, item.Type);

        try
        {
            // Update status to in progress
            await workQueueRepo.UpdateStatusAsync(item.Id, WorkQueueStatus.InProgress, DateTime.UtcNow);
            await NotifyProgress(hubContext, item.Id, WorkQueueStatus.InProgress, 0);

            switch (item.Type)
            {
                case WorkQueueType.LogPurge:
                    await ProcessLogPurge(scope, item, hubContext, cancellationToken);
                    break;
                default:
                    throw new NotSupportedException($"Work queue type {item.Type} is not supported");
            }

            // Mark as completed
            await workQueueRepo.UpdateStatusAsync(item.Id, WorkQueueStatus.Completed, completedAt: DateTime.UtcNow);
            await NotifyProgress(hubContext, item.Id, WorkQueueStatus.Completed, 100);

            _logger.LogInformation("Completed work queue item {Id}", item.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing work queue item {Id}", item.Id);
            await workQueueRepo.UpdateErrorAsync(item.Id, ex.Message);
            await NotifyProgress(hubContext, item.Id, WorkQueueStatus.Failed, item.Progress, ex.Message);
        }
    }

    private async Task ProcessLogPurge(IServiceScope scope, WorkQueue item, IHubContext<LogHub> hubContext, CancellationToken cancellationToken)
    {
        var dbFactory = scope.ServiceProvider.GetRequiredService<DbConnectionFactory>();
        var workQueueRepo = scope.ServiceProvider.GetRequiredService<WorkQueueRepo>();
        var logRepo = scope.ServiceProvider.GetRequiredService<LogRepo>();
        var logSummaryRepo = scope.ServiceProvider.GetRequiredService<LogSummaryRepo>();

        if (string.IsNullOrEmpty(item.PodName))
        {
            throw new InvalidOperationException("PodName is required for log purge");
        }

        // Estimate total records
        var estimatedRecords = await workQueueRepo.EstimateRecordsAsync(item.PodName, item.TimeRange);
        await workQueueRepo.UpdateProgressAsync(item.Id, 0, 0);
        item.EstimatedRecords = estimatedRecords;

        _logger.LogInformation("Starting purge of {EstimatedRecords} records for pod {PodName}", estimatedRecords, item.PodName);

        // Calculate date filter
        DateTime? startDate = null;
        switch (item.TimeRange?.ToLower())
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

        // Perform batch deletion  
        using var db = dbFactory.CreateConnection();

        const int batchSize = 10000;
        var totalDeleted = 0;
        var lastProgress = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            var query = new StringBuilder($"DELETE FROM {db.GetQuotedTableName<Log>()} WHERE Pod = @pod");

            if (startDate.HasValue)
                query.Append(" AND TimeStamp >= @startDate");

            query.Append($" LIMIT {batchSize}");

            try
            {
                // Use OrmLite's ExecuteNonQueryAsync with parameters
                // Note: OrmLite doesn't easily support per-command timeouts, 
                // but batching in small chunks should prevent most timeout issues
                var deletedCount = await db.ExecuteAsync(query.ToString(), new
                {
                    pod = item.PodName,
                    startDate = startDate
                });

                if (deletedCount == 0)
                    break;

                totalDeleted += deletedCount;

                // Update progress
                var progress = estimatedRecords > 0
                    ? Math.Min(100, (int)((double)totalDeleted / estimatedRecords * 100))
                    : 50; // If we can't estimate, just show 50% progress

                if (progress != lastProgress)
                {
                    await workQueueRepo.UpdateProgressAsync(item.Id, progress, totalDeleted);
                    await NotifyProgress(hubContext, item.Id, WorkQueueStatus.InProgress, progress, recordsAffected: totalDeleted);
                    lastProgress = progress;
                }

                _logger.LogDebug("Deleted {BatchCount} records, total: {TotalDeleted}", deletedCount, totalDeleted);

                // Small delay to prevent overwhelming the database
                await Task.Delay(100, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during batch deletion");
                throw;
            }
        }

        // Delete from summary tables
        await logSummaryRepo.PurgeByPod(item.PodName, startDate);
        await logSummaryRepo.PurgeHourlyByPod(item.PodName, startDate);

        // Update final count
        await workQueueRepo.UpdateProgressAsync(item.Id, 100, totalDeleted);

        _logger.LogInformation("Completed purge of {TotalDeleted} records for pod {PodName}", totalDeleted, item.PodName);
    }

    private async Task NotifyProgress(IHubContext<LogHub> hubContext, int id, string status, int progress, string? errorMessage = null, int? recordsAffected = null)
    {
        var update = new WorkQueueProgressUpdate
        {
            Id = id,
            Status = status,
            Progress = progress,
            ErrorMessage = errorMessage,
            RecordsAffected = recordsAffected
        };

        await hubContext.Clients.All.SendAsync("WorkQueueProgress", update);
    }
}
