using System.Text.Json;
using LogMkApi.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using RoboDodd.OrmLite;

namespace LogMkApi.Common.HealthCheck;

public static class HealthCheck
{
    private static readonly JsonSerializerOptions s_serializerOptions = new JsonSerializerOptions
    {
        WriteIndented = true
    };
    public static void AddHealthChecks(IServiceCollection services, DbConnectionFactory dbFactory)
    {
        _ = services.AddHealthChecks().AddCheck("database", new MySqlHealthCheck(dbFactory, "Log"))
              .AddCheck<LoggingMetricsHealthCheck>(
                  "logging-metrics",
                  HealthStatus.Degraded,
                  new[] { "api", "metrics", "system" });
    }


    public static async Task WriteResponse(HttpContext context,
        HealthReport report)
    {
        context.Response.ContentType = "application/json";
        var response = new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(x => new
            {
                name = x.Key,
                status = x.Value.Status.ToString(),
                description = x.Value.Description,
                data = x.Value.Data
            })
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(response, s_serializerOptions));

    }


}
public static class HealthCheckExtensions
{
    public static IHealthChecksBuilder AddLogMkHealthChecks(this IHealthChecksBuilder builder, string name, DbConnectionFactory dbFactory)
    {
        return builder.AddCheck(name, new MySqlHealthCheck(dbFactory, "Log"))
            .AddCheck<LoggingMetricsHealthCheck>(
                "logging-metrics",
                HealthStatus.Degraded,
                new[] { "api", "metrics", "system" });
    }
}
