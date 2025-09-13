namespace LogMkApi.Common.HealthCheck;

using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using RoboDodd.OrmLite;

public class MySqlHealthCheck : IHealthCheck
{
    private readonly DbConnectionFactory _dbFactory;
    private readonly string _table;
    public MySqlHealthCheck(DbConnectionFactory dbFactory, string table)
    {
        _dbFactory = dbFactory;
        _table = table;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();

        try
        {
            using var connection = _dbFactory.CreateConnection();
            using var command = connection.CreateCommand();



            await connection.ExecuteAsync($"SELECT * FROM {_table} limit 1");

            stopwatch.Stop();

            var data = new Dictionary<string, object>
            {
                ["responseTimeMs"] = stopwatch.ElapsedMilliseconds,
                ["responseTimeTicks"] = stopwatch.ElapsedTicks,
                ["timestamp"] = DateTime.UtcNow
            };

            return HealthCheckResult.Healthy("SQLite is available.", data);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();

            var data = new Dictionary<string, object>
            {
                ["responseTimeMs"] = stopwatch.ElapsedMilliseconds,
                ["responseTimeTicks"] = stopwatch.ElapsedTicks,
                ["timestamp"] = DateTime.UtcNow,
                ["error"] = ex.Message
            };

            return HealthCheckResult.Unhealthy("SQLite is unavailable.", ex, data);
        }
    }

}
