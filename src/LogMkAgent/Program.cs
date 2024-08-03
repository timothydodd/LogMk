using LogMkAgent.Services;
using Microsoft.Extensions.Options;

// Add any other namespaces required for your services

public class Program
{
    public static async Task Main(string[] args)
    {
        var host = Host.CreateDefaultBuilder(args)
            .ConfigureServices((hostContext, services) =>
            {
                // Configuration
                IConfiguration configuration = hostContext.Configuration;

                // Services
                services.AddSingleton<BatchingService>();
                services.AddSingleton<HttpLogger>();
                var settings = configuration.GetSection("LogWatcherOptions");
                var apiSettings = configuration.GetSection("LoggingApi");

                services.Configure<LogWatcherOptions>(settings);
                services.Configure<ApiSettings>(apiSettings);
                services.AddHttpClient();
                services.AddHttpClient<LogApiClient>((serviceProvider, client) =>
                {
                    var settings = serviceProvider.GetRequiredService<IOptions<ApiSettings>>().Value;
                    client.BaseAddress = new Uri(settings.BaseUrl);
                    // Additional configuration like timeouts, headers, etc.
                }).AddLogger<HttpLogger>(wrapHandlersPipeline: true);

                // Configure strongly typed settings objects
                //var serviceConfig = configuration.GetSection("ServiceConfig").Get<ServiceConfig>();
                //services.AddSingleton(serviceConfig);
                services.AddLogging(logging =>
                {
                    logging.AddSimpleConsole(c =>
                   {
                       c.SingleLine = true;
                       c.IncludeScopes = true;
                       c.TimestampFormat = "HH:mm:ss ";
                   });
                });
                // Add hosted service
                services.AddHostedService<LogWatcher>();
            })
            .ConfigureAppConfiguration((hostingContext, config) =>
            {
                // Additional configuration settings can be set here if needed
                config.AddJsonFile("appsettings.json", optional: true, reloadOnChange: true).AddEnvironmentVariables();
            })
            .Build();

        await host.RunAsync();
    }
}

