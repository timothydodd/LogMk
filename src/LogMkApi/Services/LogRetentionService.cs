using Dapper;
using LogMkApi.Data;
using LogMkApi.Data.Models;
using RoboDodd.OrmLite;

namespace LogMkApi.Services;

public class LogRetentionService : BackgroundService
{
    private readonly ILogger<LogRetentionService> _logger;
    private readonly DbConnectionFactory _dbFactory;
    private readonly IConfiguration _configuration;

    private readonly TimeSpan _executionTime = TimeSpan.FromHours(2); // Run at 2:00 AM UTC

    public LogRetentionService(
        DbConnectionFactory dbFactory,
        ILogger<LogRetentionService> logger,
        IConfiguration configuration)
    {
        _dbFactory = dbFactory;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("LogRetentionService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;
            var nextRun = CalculateNextRunTime(now);
            var delay = nextRun - now;

            _logger.LogInformation("Next retention cleanup scheduled for {NextRun:yyyy-MM-dd HH:mm:ss} UTC", nextRun);

            await Task.Delay(delay, stoppingToken);

            if (stoppingToken.IsCancellationRequested)
                break;

            try
            {
                await RunRetentionCleanupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during retention cleanup");
            }
        }

        _logger.LogInformation("LogRetentionService stopped");
    }

    private DateTime CalculateNextRunTime(DateTime now)
    {
        var todayExecutionTime = new DateTime(
            now.Year, now.Month, now.Day,
            _executionTime.Hours, _executionTime.Minutes, _executionTime.Seconds);

        return now > todayExecutionTime
            ? todayExecutionTime.AddDays(1)
            : todayExecutionTime;
    }

    private async Task RunRetentionCleanupAsync(CancellationToken cancellationToken)
    {
        var retentionDays = _configuration.GetValue<int>("LogSettings:MaxDaysOld");
        if (retentionDays <= 0)
            retentionDays = 30;

        var cutoffDate = DateTime.UtcNow.AddDays(-retentionDays).Date;

        _logger.LogInformation(
            "Starting retention cleanup: deleting logs older than {RetentionDays} days (before {CutoffDate:yyyy-MM-dd})",
            retentionDays, cutoffDate);

        var totalDeleted = 0L;
        const int batchSize = 10000;

        using var db = _dbFactory.CreateConnection();

        // Batch delete from Log table
        while (!cancellationToken.IsCancellationRequested)
        {
            var deleted = await db.ExecuteAsync(
                $"DELETE FROM {db.GetQuotedTableName<Log>()} WHERE LogDate < @cutoffDate LIMIT {batchSize}",
                new { cutoffDate });

            if (deleted == 0)
                break;

            totalDeleted += deleted;

            _logger.LogDebug("Retention cleanup: deleted {BatchCount} records, total: {TotalDeleted}", deleted, totalDeleted);

            // Small delay to avoid overwhelming the database
            await Task.Delay(100, cancellationToken);
        }

        // Clean up summary tables
        if (!cancellationToken.IsCancellationRequested)
        {
            var summaryDeleted = await db.ExecuteAsync(
                "DELETE FROM LogSummary WHERE LogDate < @cutoffDate",
                new { cutoffDate });

            var hourlyDeleted = await db.ExecuteAsync(
                "DELETE FROM LogSummaryHour WHERE LogDate < @cutoffDate",
                new { cutoffDate });

            _logger.LogInformation(
                "Retention cleanup completed: {LogsDeleted} logs, {SummaryDeleted} daily summaries, {HourlyDeleted} hourly summaries removed",
                totalDeleted, summaryDeleted, hourlyDeleted);
        }
    }
}
