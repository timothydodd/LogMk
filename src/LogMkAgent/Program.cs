using LogMkAgent.Services;

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

                var settings = configuration.GetSection("LogWatcherOptions");
                services.Configure<LogWatcherOptions>(settings);

                // Configure strongly typed settings objects
                //var serviceConfig = configuration.GetSection("ServiceConfig").Get<ServiceConfig>();
                //services.AddSingleton(serviceConfig);

                // Add hosted service
                services.AddHostedService<LogWatcher>();
            })
            .ConfigureAppConfiguration((hostingContext, config) =>
            {
                // Additional configuration settings can be set here if needed
                config.AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);
            })
            .Build();

        await host.RunAsync();
    }
}

