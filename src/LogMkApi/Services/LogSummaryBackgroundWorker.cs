﻿using MySql.Data.MySqlClient;
using ServiceStack.Data;

namespace LogSummaryService
{
    public class LogSummaryBackgroundService : BackgroundService
    {
        private readonly ILogger<LogSummaryBackgroundService> _logger;
        private readonly IDbConnectionFactory _dbFactory;


        private readonly TimeSpan _executionTime;

        public LogSummaryBackgroundService(IDbConnectionFactory dbFactory,
            ILogger<LogSummaryBackgroundService> logger)
        {
            _dbFactory = dbFactory;
            _logger = logger;
            // Default to running at 1:00 AM
            _executionTime = TimeSpan.FromHours(1);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Log Summary Background Service is starting.");

            while (!stoppingToken.IsCancellationRequested)
            {
                // Calculate time until next execution
                var now = DateTime.Now;
                var nextRun = CalculateNextRunTime(now);
                var delay = nextRun - now;

                _logger.LogInformation($"Next log summary update scheduled for {nextRun:yyyy-MM-dd HH:mm:ss}");

                // Wait until the scheduled time
                await Task.Delay(delay, stoppingToken);

                // If cancellation was requested during the delay, exit
                if (stoppingToken.IsCancellationRequested)
                    break;

                try
                {
                    await UpdateYesterdaysSummaryAsync();
                    _logger.LogInformation("Log summary update completed successfully.");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error updating log summary table.");
                }
            }

            _logger.LogInformation("Log Summary Background Service is stopping.");
        }

        private DateTime CalculateNextRunTime(DateTime now)
        {
            // Create a DateTime for today at the specified execution time
            var todayExecutionTime = new DateTime(
                now.Year, now.Month, now.Day,
                _executionTime.Hours, _executionTime.Minutes, _executionTime.Seconds);

            // If that time has already passed today, schedule for tomorrow
            if (now > todayExecutionTime)
            {
                return todayExecutionTime.AddDays(1);
            }

            // Otherwise, schedule for today
            return todayExecutionTime;
        }

        private async Task UpdateYesterdaysSummaryAsync()
        {
            using (var connection = _dbFactory.OpenDbConnection())
            {
                var yesterday = DateTime.Now.AddDays(-1).Date;
                _logger.LogInformation($"Updating log summary for {yesterday:yyyy-MM-dd}");




                // Delete existing entries for yesterday
                using (var deleteCommand = new MySqlCommand())
                {
                    deleteCommand.Connection = (MySqlConnection)connection;
                    deleteCommand.CommandText = @"
                        DELETE FROM LogSummary 
                        WHERE LogDate = @yesterday";
                    deleteCommand.Parameters.AddWithValue("@yesterday", yesterday);

                    await deleteCommand.ExecuteNonQueryAsync();
                }

                // Insert fresh summary data for yesterday
                using (var insertCommand = new MySqlCommand())
                {
                    insertCommand.Connection = (MySqlConnection)connection;
                    insertCommand.CommandText = @"
                        INSERT INTO LogSummary (Deployment, Pod, LogLevel, LogDate, Count, LastUpdated)
                        SELECT 
                            Deployment,
                            Pod,
                            LogLevel,
                            LogDate,
                            COUNT(*) AS Count,
                            NOW() AS LastUpdated
                        FROM 
                            Log
                        WHERE 
                            LogDate = @yesterday
                        GROUP BY 
                            Deployment, Pod, LogLevel, LogDate";
                    insertCommand.Parameters.AddWithValue("@yesterday", yesterday);

                    await insertCommand.ExecuteNonQueryAsync();
                }
            }

        }
    }
}
