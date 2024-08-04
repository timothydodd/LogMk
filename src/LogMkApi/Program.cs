using System.Data;
using LogMkApi.Common;
using LogMkApi.Data;
using LogMkApi.Hubs;
using LogMkApi.Services;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.ResponseCompression;
using ServiceStack;
using ServiceStack.Data;
using ServiceStack.OrmLite;
using ServiceStack.OrmLite.Dapper;

namespace LogMkApi;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateSlimBuilder(args);
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
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.TypeInfoResolver = new ApiJsonSerializerContext();

        });
        builder.Services.AddSingleton<IBackgroundTaskQueue, BackgroundTaskQueue>();
        builder.Services.AddHostedService<BackgroundWorkerService>();
        builder.Services.AddControllers();
        builder.Services.AddSignalR();
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
        builder.Services.AddScoped<LogHubService>();
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
        builder.Services.Configure<BackgroundTaskQueueOptions>(options =>
        {
            options.Capacity = 100; // Set a default or load from configuration
        });
        HealthCheck.AddHealthChecks(builder.Services, connectionString);
        SqlMapper.AddTypeHandler(new DateTimeHandler());

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
        app.MapHub<LogHub>("/loghub");
        app.UseHealthChecks("/api/health", new HealthCheckOptions { ResponseWriter = HealthCheck.WriteResponse });
        app.Run();
    }
}
