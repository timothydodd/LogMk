using Dapper;
using LogMkApi.Data.Models;
using LogMkApi.Services;
using RoboDodd.OrmLite;

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
            db.CreateTableIfNotExists<Log>(true);
            db.CreateTableIfNotExists<LogSummary>(true);
            db.CreateTableIfNotExists<LogSummaryHour>(true);

            db.CreateTableIfNotExists<WorkQueue>(true);
            if (db.CreateTableIfNotExists<User>(true))
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
            db.CreateTableIfNotExists<RefreshToken>(true);
            // Ensure critical indexes exist (migration for existing databases)
            EnsureLogIndexes(db);
        }
    }

    private void EnsureLogIndexes(System.Data.IDbConnection db)
    {
        var missingIndexes = new List<(string Name, string Sql)>();

        try
        {
            var indexesToCheck = new[]
            {
                ("Deployment_Pod_TimeStamp_idx", "CREATE INDEX Deployment_Pod_TimeStamp_idx ON `Log` (Deployment, Pod, TimeStamp)"),
                ("LogDate_idx", "CREATE INDEX LogDate_idx ON `Log` (LogDate)")
            };

            foreach (var (name, createSql) in indexesToCheck)
            {
                var checkIndexSql = @"
                    SELECT COUNT(*)
                    FROM information_schema.statistics
                    WHERE table_schema = DATABASE()
                    AND table_name = 'Log'
                    AND index_name = @indexName";

                var indexExists = db.ExecuteScalar<int>(checkIndexSql, new { indexName = name }) > 0;

                if (!indexExists)
                {
                    missingIndexes.Add((name, createSql));
                }
                else
                {
                    _logger.LogInformation("Index {IndexName} exists on Log table", name);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check indexes");
            return;
        }

        if (missingIndexes.Count > 0)
        {
            // Create missing indexes in a background task so startup isn't blocked
            _ = Task.Run(() => CreateMissingIndexesAsync(missingIndexes));
        }
    }

    private void CreateMissingIndexesAsync(List<(string Name, string Sql)> indexes)
    {
        foreach (var (name, createSql) in indexes)
        {
            try
            {
                _logger.LogInformation("Creating missing index {IndexName} in background...", name);

                using var db = _dbFactory.CreateConnection();
                db.ExecuteScalar<int>(createSql);

                _logger.LogInformation("Successfully created index {IndexName}", name);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to create index {IndexName}. You can create it manually: {Sql}", name, createSql);
            }
        }
    }
}
