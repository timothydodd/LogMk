using LogMkAgent.Services;
using Microsoft.Extensions.Options;

// Add any other namespaces required for your services

public class Program
{
    public static async Task Main(string[] args)
    {
        var host = Host.CreateDefaultBuilder(args).ConfigureAppConfiguration((hostingContext, config) =>
            {
                var env = hostingContext.HostingEnvironment;

                config.AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
                      .AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true, reloadOnChange: true)
                      .AddEnvironmentVariables();


                // Add user secrets for development
                //  if (env.IsDevelopment())
                // {
                config.AddUserSecrets<Program>();
                // }
            })
            .ConfigureServices((hostContext, services) =>
            {
                var configuration = hostContext.Configuration;

                // Configure strongly typed settings
                services.Configure<LogWatcherOptions>(configuration.GetSection("LogWatcherOptions"));
                services.Configure<ApiSettings>(configuration.GetSection("LoggingApi"));

                // Register services
                services.AddSingleton<BatchingService>();
                services.AddSingleton<HttpLogger>();
                services.AddSingleton<SettingsService>();
                services.AddMemoryCache(); // Required for SettingsService caching

                // Configure HttpClient with typed client
                services.AddHttpClient<LogApiClient>((serviceProvider, client) =>
                {
                    var apiSettings = serviceProvider.GetRequiredService<IOptions<ApiSettings>>().Value;
                    client.BaseAddress = new Uri(apiSettings.BaseUrl);

                    // Configure additional settings like timeouts, headers, etc.
                    client.Timeout = TimeSpan.FromSeconds(30);
                })
                .AddLogger<HttpLogger>(wrapHandlersPipeline: true);

                // Configure logging
                services.AddLogging(logging =>
                {
                    logging.AddSimpleConsole(options =>
                    {
                        options.SingleLine = true;
                        options.IncludeScopes = true;
                        options.TimestampFormat = "HH:mm:ss ";
                    });
                });

                // Register hosted service
                services.AddHostedService<LogWatcher>();
            }).Build();

        await host.RunAsync();
    }
}

