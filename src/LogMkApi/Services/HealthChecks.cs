using System.Dynamic;
using System.Text.Json;
using Microsoft.Extensions.Diagnostics.HealthChecks;



public static class HealthCheck
{
    public static void AddHealthChecks(IServiceCollection services, string connectionString)
    {
        _ = services.AddHealthChecks()
            .AddMySql(
                connectionString: connectionString,
                name: "MYSQL DB",
                failureStatus: HealthStatus.Degraded,
                tags: new string[] { "db", "sql" }
            );
    }


    public static Task WriteResponse(HttpContext httpContext,
        HealthReport result)
    {
        httpContext.Response.ContentType = "application/json";
        var hc = new
        {
            status = result.Status.ToString(),
            results = GetResultsExpando(result)
        };


        return httpContext.Response.WriteAsync(
            JsonSerializer.Serialize(hc, new JsonSerializerOptions() { WriteIndented = true }));

        static ExpandoObject GetResultsExpando(HealthReport result)
        {
            dynamic resultExpando = new ExpandoObject();
            foreach (KeyValuePair<string, HealthReportEntry> entry in result.Entries)
            {
                _ = AddProperty(resultExpando, entry.Key, new
                {
                    status = entry.Value.Status.ToString(),
                    description = entry.Value.Description,
                    data = GetDataExpando(entry.Value.Data)
                });
            }
            return resultExpando;
        }

        static ExpandoObject GetDataExpando(IReadOnlyDictionary<string, object> data)
        {
            dynamic dataExpando = new ExpandoObject();
            foreach (KeyValuePair<string, object> d in data)
            {
                _ = AddProperty(dataExpando, d.Key, d.Value);
            }

            return dataExpando;
        }

        static bool AddProperty(ExpandoObject obj, string key, object value)
        {
            var dynamicDict = obj as IDictionary<string, object>;
            if (dynamicDict.ContainsKey(key))
            {
                return false;
            }
            else
            {
                dynamicDict.Add(key, value);
            }

            return true;
        }

    }


}
