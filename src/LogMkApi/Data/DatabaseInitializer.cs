using LogMkApi.Data.Models;
using LogMkApi.Services;
using RoboDodd.OrmLite;

namespace LogMkApi.Data;

public class DatabaseInitializer
{
    private readonly DbConnectionFactory _dbFactory;
    private readonly PasswordService _passwordService;

    public DatabaseInitializer(DbConnectionFactory dbFactory, PasswordService passwordService)
    {
        _dbFactory = dbFactory;
        _passwordService = passwordService;
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
        }
    }
}
