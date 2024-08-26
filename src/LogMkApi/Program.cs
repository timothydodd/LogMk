using System.Data;
using System.Text;
using LogMkApi.Common;
using LogMkApi.Data;
using LogMkApi.Hubs;
using LogMkApi.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.ResponseCompression;
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
        builder.Services.AddSingleton<PasswordService>();
        builder.Services.AddSingleton<AuthService>();
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
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Secret"]))
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
        if (origins is not null)
        {
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("LogMkOrigins",
                    policy =>
                    {
                        policy.WithOrigins(origins) // Specify the allowed domains
                                            .AllowAnyHeader()
                                            .AllowAnyMethod()
                                            .SetIsOriginAllowed(x => true)
                                            .AllowCredentials();
                    });

            });
        }
        else
        {
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("LogMkOrigins",
                builder => builder
                    .AllowAnyOrigin()
                    .AllowAnyMethod()
                    .AllowAnyHeader());
            });
        }
        HealthCheck.AddHealthChecks(builder.Services, connectionString);
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

        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();
        app.MapHub<LogHub>("/loghub");
        app.UseHealthChecks("/api/health", new HealthCheckOptions { ResponseWriter = HealthCheck.WriteResponse });
        app.Run();
    }
}
