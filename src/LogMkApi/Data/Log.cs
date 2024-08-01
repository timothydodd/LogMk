using ServiceStack.Data;
using ServiceStack.DataAnnotations;
using ServiceStack.OrmLite;

namespace LogMkApi.Data;


public class LogRepo
{
    private readonly IDbConnectionFactory _dbFactory;
    public LogRepo(IDbConnectionFactory dbFactory)
    {
        _dbFactory = dbFactory;
    }

    public async Task BulkInsert(List<Log> logs)
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            await db.InsertAllAsync(logs);
        }

    }
}
public class Log
{
    [AutoIncrement]
    public int Id { get; set; }
    [Index]
    public required string Deployment { get; set; }
    [Index]
    public required string Pod { get; set; }
    [StringLength(3000)]
    public required string Line { get; set; }
    public required string LogLevel { get; set; }
    public required DateTimeOffset TimeStamp { get; set; }
}
