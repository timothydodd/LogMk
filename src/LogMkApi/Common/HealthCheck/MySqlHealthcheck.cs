namespace LogMkApi.Common.HealthCheck;

using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using ServiceStack.Data;
using ServiceStack.OrmLite;

public class MySqlHealthCheck : IHealthCheck
{
    private readonly IDbConnectionFactory _dbFactory;
    private readonly string _table;
    public MySqlHealthCheck(IDbConnectionFactory dbFactory, string table)
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
            using var connection = await _dbFactory.OpenDbConnectionAsync();
            using var command = connection.CreateCommand();


            command.CommandText = $"SELECT * FROM {_table} limit 1";
            await command.ExecNonQueryAsync();

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
