using LogMkApi.Data.Models;
using LogMkApi.Services;
using ServiceStack.Data;
using ServiceStack.OrmLite;

namespace LogMkApi.Data;

public class DatabaseInitializer
{
    private readonly IDbConnectionFactory _dbFactory;
    private readonly PasswordService _passwordService;

    public DatabaseInitializer(IDbConnectionFactory dbFactory, PasswordService passwordService)
    {
        _dbFactory = dbFactory;
        _passwordService = passwordService;
    }

    public void CreateTable()
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            db.CreateTableIfNotExists<Log>();
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
