using System.Data;
using LogMkApi.Data;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.ResponseCompression;
using ServiceStack;
using ServiceStack.Data;
using ServiceStack.OrmLite;

namespace LogMkApi;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.Services.AddRequestDecompression();
        builder.Services.AddResponseCompression(options =>
        {
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
            options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
            {
            "application/json"
        });
        });
        builder.Services.AddControllers();
        builder.Services.AddMemoryCache();
        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

        if (connectionString is null)
        {
            throw new InvalidOperationException("Connection string not found");
        }
        var dbFactory = new OrmLiteConnectionFactory(connectionString, MySqlDialect.Provider);

        builder.Services.AddSingleton<IDbConnectionFactory>(dbFactory);
        builder.Services.AddTransient<IDbConnection>(sp => sp.GetRequiredService<IDbConnectionFactory>().OpenDbConnection());
        builder.Services.AddScoped<LogRepo>();
        builder.Services.AddScoped<DatabaseInitializer>();
        builder.Services.AddLogging(logging =>
        {
            logging.AddSimpleConsole(c =>
            {
                c.SingleLine = true;
                c.IncludeScopes = false;
                c.TimestampFormat = "HH:mm:ss ";
            });

            logging.AddDebug();
        });
        HealthCheck.AddHealthChecks(builder.Services, connectionString);
        var app = builder.Build();


        using (var scope = app.Services.CreateScope())
        {
            var dbInitializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
            dbInitializer.CreateTable();
        }
        // Enable middleware to handle decompression
        app.UseResponseCompression();
        app.UseRequestDecompression();


        app.MapControllers();
        app.UseHealthChecks("/api/health", new HealthCheckOptions { ResponseWriter = HealthCheck.WriteResponse });
        app.Run();
    }
}
