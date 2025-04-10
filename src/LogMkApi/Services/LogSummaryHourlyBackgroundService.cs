using ServiceStack.Data;
using ServiceStack.OrmLite;
namespace LogSummaryService
{
    public class LogSummaryHourlyBackgroundService : BackgroundService
    {
        private readonly ILogger<LogSummaryHourlyBackgroundService> _logger;
        private readonly IDbConnectionFactory _dbFactory;

        public LogSummaryHourlyBackgroundService(IDbConnectionFactory dbFactory,
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
                var now = DateTime.Now;
                var nextRun = CalculateNextRunTime(now);
                var delay = nextRun - now;

                _logger.LogInformation($"Next log summary update scheduled for {nextRun:yyyy-MM-dd HH:mm:ss}");

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
            using (var connection = _dbFactory.OpenDbConnection())
            {
                var date = DateTime.Now.Date;
                var hour = DateTime.Now.Hour;

                _logger.LogInformation($"Updating log summary for hour {hour} on {date:yyyy-MM-dd}");

                await connection.ExecuteNonQueryAsync(@"
                    DELETE FROM LogSummaryHour WHERE LogDate = @date AND LogHour = @hour;
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
                        Deployment, Pod, LogLevel, LogHour, LogDate", new { date, hour });
            }
        }
    }
}
