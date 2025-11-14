using LogMkApi.Data.Models;
using LogMkApi.Services;
using RoboDodd.OrmLite;
using Dapper;

namespace LogMkApi.Data;

public class DatabaseInitializer
{
    private readonly DbConnectionFactory _dbFactory;
    private readonly PasswordService _passwordService;
    private readonly ILogger<DatabaseInitializer> _logger;

    public DatabaseInitializer(DbConnectionFactory dbFactory, PasswordService passwordService, ILogger<DatabaseInitializer> logger)
    {
        _dbFactory = dbFactory;
        _passwordService = passwordService;
        _logger = logger;
    }

    public void CreateTable()
    {
        using (var db = _dbFactory.CreateConnection())
        {
            db.CreateTableIfNotExists<Log>();
            db.CreateTableIfNotExists<LogSummary>();
            db.CreateTableIfNotExists<LogSummaryHour>();
            db.CreateTableIfNotExists<RefreshToken>();
            db.CreateTableIfNotExists<WorkQueue>();
            if (db.CreateTableIfNotExists<User>())
            {
                var user = new User
                {
                    Id = Guid.NewGuid(),
                    UserName = "admin",
                    PasswordHash = "",
                    TimeStamp = DateTime.UtcNow
                };
                user.PasswordHash = _passwordService.HashPassword(user, "admin");
                db.Insert(user);
            }

            // Ensure critical indexes exist (migration for existing databases)
            EnsureLogIndexes(db);
        }
    }

    private void EnsureLogIndexes(System.Data.IDbConnection db)
    {
        try
        {
            // Check if the composite index exists
            var checkIndexSql = @"
                SELECT COUNT(*)
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                AND table_name = 'Log'
                AND index_name = 'Deployment_Pod_TimeStamp_idx'";

            var indexExists = db.ExecuteScalar<int>(checkIndexSql) > 0;

            if (!indexExists)
            {
                _logger.LogInformation("Creating missing composite index Deployment_Pod_TimeStamp_idx on Log table");

                // Create the index
                var createIndexSql = @"
                    CREATE INDEX Deployment_Pod_TimeStamp_idx
                    ON `Log` (Deployment, Pod, TimeStamp)";

                db.Execute(createIndexSql);
                _logger.LogInformation("Successfully created composite index Deployment_Pod_TimeStamp_idx");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to create missing indexes, they may already exist or require manual creation");
        }
    }
}
