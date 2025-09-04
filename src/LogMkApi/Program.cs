using System.Data;
using System.Text;
using LogMkApi.Common;
using LogMkApi.Common.HealthCheck;
using LogMkApi.Data;
using LogMkApi.HealthChecks;
using LogMkApi.Hubs;
using LogMkApi.Services;
using LogSummaryService;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ServiceStack;
using ServiceStack.Data;
using ServiceStack.OrmLite;
using ServiceStack.OrmLite.Dapper;

namespace LogMkApi;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        
        // Configure cleaner logging format
        builder.Logging.ClearProviders();
        builder.Logging.AddSimpleConsole(options =>
        {
            options.SingleLine = true;
            options.TimestampFormat = "yyyy-MM-dd HH:mm:ss ";
            options.UseUtcTimestamp = true;
            options.IncludeScopes = false;
        });
        
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

        // Add rate limiting
        builder.Services.AddRateLimiter(options =>
        {
            // Strict rate limiting for authentication endpoints
            options.AddFixedWindowLimiter("AuthPolicy", limiterOptions =>
            {
                limiterOptions.PermitLimit = 5; // 5 attempts per window
                limiterOptions.Window = TimeSpan.FromMinutes(1); // 1 minute window
                limiterOptions.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
                limiterOptions.QueueLimit = 2; // Allow 2 queued requests
            });

            // More lenient rate limiting for general API endpoints
            options.AddFixedWindowLimiter("ApiPolicy", limiterOptions =>
            {
                limiterOptions.PermitLimit = 100; // 100 requests per window
                limiterOptions.Window = TimeSpan.FromMinutes(1); // 1 minute window
                limiterOptions.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
                limiterOptions.QueueLimit = 10;
            });

            // Default policy for other endpoints
            options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(context =>
                System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: context.User?.Identity?.Name ?? context.Request.Headers.Host.ToString(),
                    factory: partition => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                    {
                        AutoReplenishment = true,
                        PermitLimit = 200,
                        Window = TimeSpan.FromMinutes(1)
                    }));

            options.OnRejected = async (context, token) =>
            {
                context.HttpContext.Response.StatusCode = 429;
                await context.HttpContext.Response.WriteAsync("Too many requests. Please try again later.", cancellationToken: token);
            };
        });
        builder.Services.AddSingleton<IBackgroundTaskQueue, BackgroundTaskQueue>();
        builder.Services.AddHostedService<BackgroundWorkerService>();
        builder.Services.AddHostedService<LogSummaryDailyBackgroundService>();
        builder.Services.AddHostedService<LogSummaryHourlyBackgroundService>();
        builder.Services.AddHostedService<WorkQueueProcessorService>();
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
        builder.Services.AddScoped<LogSummaryRepo>();
        builder.Services.AddScoped<WorkQueueRepo>();
        builder.Services.AddScoped<LogHubService>();
        builder.Services.AddScoped<DatabaseInitializer>();
        builder.Services.AddSingleton<LogApiMetrics>();
        builder.Services.AddSingleton<PasswordService>();
        builder.Services.AddSingleton<AuthService>();
        builder.Services.AddScoped<RefreshTokenService>();
        builder.Services.AddSingleton<IOptions<LoggingHealthOptions>>(
          new OptionsWrapper<LoggingHealthOptions>(new LoggingHealthOptions()));
        builder.Services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        }).AddJwtBearer(options =>
        {
            var jwtSettings = builder.Configuration.GetSection("JwtSettings");
            
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtSettings["Issuer"],
                ValidAudience = jwtSettings["Audience"],
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Secret"] ?? throw new InvalidOperationException("JWT secret not configured")))
            };
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];

                    // If the request is for our hub...
                    var path = context.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/loghub"))
                    {
                        // Read the token out of the query string
                        context.Token = accessToken;
                    }
                    return Task.CompletedTask;
                }
            };
        });

        builder.Services.Configure<BackgroundTaskQueueOptions>(options =>
        {
            options.Capacity = 100; // Set a default or load from configuration
        });

        var origins = builder.Configuration.GetValue<string>("CorsOrigins")?.Split(',');
        if (origins is not null && origins.Length > 0 && !string.IsNullOrWhiteSpace(origins[0]))
        {
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("LogMkOrigins",
                    policy =>
                    {
                        policy.WithOrigins(origins) // Specify the allowed domains
                                            .AllowAnyHeader()
                                            .AllowAnyMethod()
                                            .AllowCredentials();
                    });

            });
        }
        else
        {
            // For development only - require explicit CORS_ORIGINS environment variable in production
            var isDevelopment = builder.Environment.IsDevelopment();
            if (!isDevelopment)
            {
                throw new InvalidOperationException("CORS origins must be explicitly configured in production. Set CorsOrigins configuration value.");
            }

            builder.Services.AddCors(options =>
            {
                options.AddPolicy("LogMkOrigins",
                    policy => policy
                        .WithOrigins("http://localhost:6200", "https://localhost:6200") // Development origins only
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials());
            });
        }
        HealthCheck.AddHealthChecks(builder.Services, dbFactory);
        SqlMapper.AddTypeHandler(new DateTimeHandler());

        var app = builder.Build();


        using (var scope = app.Services.CreateScope())
        {
            var dbInitializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
            dbInitializer.CreateTable();
        }
        app.UseCors("LogMkOrigins");
        // Enable middleware to handle decompression
        app.UseResponseCompression();
        app.UseRequestDecompression();

        // Enable rate limiting
        app.UseRateLimiter();

        app.UseAuthentication();
        app.UseAuthorization();
        app.UseDefaultFiles();
        app.UseStaticFiles();
        app.MapControllers();
        app.MapHub<LogHub>("/loghub");
        app.UseHealthChecks("/api/health", new HealthCheckOptions { ResponseWriter = HealthCheck.WriteResponse });
        app.MapFallbackToFile("/index.html");
        app.Run();
    }
}
