using Dapper;
using RoboDodd.OrmLite;
namespace LogSummaryService
{
    public class LogSummaryHourlyBackgroundService : BackgroundService
    {
        private readonly ILogger<LogSummaryHourlyBackgroundService> _logger;
        private readonly DbConnectionFactory _dbFactory;

        public LogSummaryHourlyBackgroundService(DbConnectionFactory dbFactory,
            ILogger<LogSummaryHourlyBackgroundService> logger)
        {
            _dbFactory = dbFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Log Summary Background Service is starting.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await UpdateCurrentHourSummaryAsync();
                    _logger.LogInformation("Log summary update completed successfully.");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error updating log summary table.");
                }

                // Calculate time until next execution (1 hour from now)
                var now = DateTime.UtcNow;
                var nextRun = CalculateNextRunTime(now);
                var delay = nextRun - now;

                _logger.LogInformation("Next log summary update scheduled for {NextRun}", nextRun.ToString("yyyy-MM-dd HH:mm:ss"));

                // Wait until the next hour
                await Task.Delay(delay, stoppingToken);

                // If cancellation was requested during the delay, exit
                if (stoppingToken.IsCancellationRequested)
                    break;
            }

            _logger.LogInformation("Log Summary Background Service is stopping.");
        }

        private DateTime CalculateNextRunTime(DateTime now)
        {
            // Schedule for the top of the next hour
            return new DateTime(now.Year, now.Month, now.Day, now.Hour, 0, 0).AddHours(1);
        }

        private async Task UpdateCurrentHourSummaryAsync()
        {
            using (var connection = _dbFactory.CreateConnection())
            {
                connection.Open();
                var date = DateTime.UtcNow.Date;
                var hour = DateTime.UtcNow.Hour - 1;

                _logger.LogInformation($"Updating log summary for hour {hour} on {date:yyyy-MM-dd}");
                using var transaction = connection.BeginTransaction();
                try
                {
                    var rowsDeleted = await connection.ExecuteAsync(@"
                        DELETE FROM LogSummaryHour WHERE LogDate = @date AND LogHour = @hour",
                        new { date, hour }, transaction);
                    _logger.LogInformation($"Deleted {rowsDeleted} rows from summary.");
                    var rowsInserted = await connection.ExecuteAsync(@"
                    INSERT INTO LogSummaryHour (Deployment, Pod, LogLevel, LogDate, LogHour, Count, LastUpdated)
                    SELECT
                        Deployment,
                        Pod,
                        LogLevel,
                        LogDate,
                        LogHour,
                        COUNT(*) AS Count,
                        NOW() AS LastUpdated
                    FROM
                        Log
                    WHERE
                        LogDate = @date AND LogHour = @hour
                    GROUP BY
                        Deployment, Pod, LogLevel, LogHour, LogDate;",
                        new { date, hour }, transaction);

                    transaction.Commit();
                    _logger.LogInformation($"Inserted {rowsInserted} rows into summary.");
                }
                catch (Exception e)
                {
                    transaction.Rollback();
                    _logger.LogError("UpdateCurrentHourSummaryAsync:" + e.Message);
                }
            }
        }
    }
}
