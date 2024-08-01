using ServiceStack.Data;
using ServiceStack.OrmLite;

namespace LogMkApi.Data;

public class DatabaseInitializer
{
    private readonly IDbConnectionFactory _dbFactory;

    public DatabaseInitializer(IDbConnectionFactory dbFactory)
    {
        _dbFactory = dbFactory;
    }

    public void CreateTable()
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            db.CreateTableIfNotExists<Log>();
        }
    }
}
