using System.Text;
using LogMkApi.Common;
using LogMkApi.Data.Models;
using LogMkCommon;
using ServiceStack.Data;
using ServiceStack.OrmLite;
using ServiceStack.OrmLite.Dapper;
using static ServiceStack.OrmLite.Dapper.SqlMapper;

namespace LogMkApi.Data;


public class LogRepo
{

    public static readonly char[] CharactersToRemoveForNumberTest = { '#', ' ' };
    private readonly IDbConnectionFactory _dbFactory;
    public LogRepo(IDbConnectionFactory dbFactory)
    {
        _dbFactory = dbFactory;
    }

    public async Task InsertAllAsync(IEnumerable<Log> logs)
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            await db.InsertAllAsync(logs);
        }

    }
    public async Task<IEnumerable<Pod>> GetPods()
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = @"SELECT DISTINCT Pod as Name FROM Log";
            return await db.QueryAsync<Pod>(query);
        }
    }

    private void AddMany<T>(IEnumerable<T>? items, DynamicParameters dynamicParameters, WhereBuilder builder, string paramName, string fieldClause)
    {
        if (items != null && items.Any())
        {
            List<string> keys = dynamicParameters.AddList(items, paramName);
            var ids = string.Join(',', keys);
            builder.AppendAnd($"{fieldClause} IN ({ids})");
        }
    }
    public async Task<PagedResults<Log>> GetAll(int offset = 0,
                                                            int pageSize = 100,
                                                            DateTime? dateStart = null,
                                                            DateTime? dateEnd = null,
                                                            string? search = null,
                                                            string[]? pod = null,
                                                            string[]? deployment = null,
                                                            string[]? logLevel = null)
    {
        var result = new PagedResults<Log>();
        var sortOrderBuilder = new List<string>();
        var whereBuilder = new WhereBuilder();
        whereBuilder.AppendAnd(dateStart, "l.TimeStamp >= @dateStart");
        whereBuilder.AppendAnd(dateEnd, "l.TimeStamp <= @dateEnd");

        var dynamicParameters = new DynamicParameters();

        AddMany(pod, dynamicParameters, whereBuilder, "plp", "l.Pod");
        AddMany(deployment, dynamicParameters, whereBuilder, "dlp", "l.Deployment");
        AddMany(logLevel, dynamicParameters, whereBuilder, "llp", "l.LogLevel");


        if (!string.IsNullOrWhiteSpace(search))
            search = $"%{search}%";



        dynamicParameters.AddIfNotNull("offset", offset);
        dynamicParameters.AddIfNotNull("pageSize", pageSize);
        dynamicParameters.AddIfNotNull("dateStart", dateStart);
        dynamicParameters.AddIfNotNull("dateEnd", dateEnd);
        dynamicParameters.AddIfNotNull("search", search);



        var likeClause = new AndOrBuilder();
        likeClause.AppendOr(search, "l.Line LIKE  @search ");
        if (likeClause.Length > 0)
        {
            whereBuilder.AppendAnd($"({likeClause})");
        }

        var queryBase = @"
         select * from Log l    
";



        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = new StringBuilder(queryBase);
            query.Append(whereBuilder);


            var totalCount = 0;
            if (offset == 0)
            {
                var q2 = $@"
                SELECT COUNT(*) FROM
                ({query}) b";
                totalCount = await db.ExecuteScalarAsync<int>(q2, dynamicParameters);
            }
            query.AppendLine($" ORDER BY l.TimeStamp DESC LIMIT @pageSize OFFSET @offset;");
            result.TotalCount = totalCount;
            var qq = query.ToString();
            result.Items = await db.QueryAsync<Log>(query.ToString(), dynamicParameters);
            result.Items ??= new List<Log>();

            return result;
        }
    }
    public async Task<IEnumerable<LatestDeploymentEntry>> GetLatestEntryTimes()
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = @"
    SELECT Deployment, Pod, MAX(TimeStamp) AS TimeStamp
    FROM Log
    GROUP BY Deployment, Pod
";
            return await db.QueryAsync<LatestDeploymentEntry>(query);
        }
    }
    public async Task<LogStatistic> GetStatistics(DateTime? dateStart = null,
                                                            DateTime? dateEnd = null,
                                                            string? search = null,
                                                            string[]? pod = null,
                                                            string[]? deployment = null,
                                                            string[]? logLevel = null)
    {
        var whereBuilder = new WhereBuilder();
        whereBuilder.AppendAnd(dateStart, "TimeStamp >= @dateStart");
        whereBuilder.AppendAnd(dateEnd, "TimeStamp <= @dateEnd");
        var dynamicParameters = new DynamicParameters();

        AddMany(pod, dynamicParameters, whereBuilder, "plp", "Pod");
        AddMany(deployment, dynamicParameters, whereBuilder, "dlp", "Deployment");
        AddMany(logLevel, dynamicParameters, whereBuilder, "llp", "LogLevel");

        if (!string.IsNullOrWhiteSpace(search))
            search = $"%{search}%";
        dynamicParameters.AddIfNotNull("dateStart", dateStart);
        dynamicParameters.AddIfNotNull("dateEnd", dateEnd);
        dynamicParameters.AddIfNotNull("search", search);




        var isGreaterThan3Days = dateStart == null ? true : DateTime.UtcNow.Subtract(dateStart.Value).TotalDays > 3;
        var query = "";
        if (isGreaterThan3Days)
        {
            query = $@"
SELECT 
    DATE(TimeStamp) AS TimeStamp,
    LogLevel,
    COUNT(*) AS Count
FROM 
    Log
{whereBuilder}
GROUP BY 
    TimeStamp, LogLevel
ORDER BY 
    TimeStamp, LogLevel;
";
        }
        else
        {
            query = $@"
            SELECT 
                CAST(DATE_FORMAT(TimeStamp, '%Y-%m-%d %H:00:00') AS DATETIME) AS TimeStamp,
                LogLevel,
                COUNT(*) AS Count
            FROM 
                Log
                {whereBuilder}
            GROUP BY 
               TimeStamp, LogLevel
            ORDER BY 
              TimeStamp, LogLevel;
            "
            ;
        }
        using (var db = _dbFactory.OpenDbConnection())
        {
            var counts = new Dictionary<DateTime, Dictionary<string, int>>();
            var result = await db.QueryAsync<LogLevelStat>(query, dynamicParameters);
            foreach (var item in result)
            {
                if (!counts.ContainsKey(item.TimeStamp))
                {
                    counts[item.TimeStamp] = new Dictionary<string, int>();
                }
                counts[item.TimeStamp][item.LogLevel] = item.Count;
            }
            return new LogStatistic()
            {
                Counts = counts,
                TimePeriod = isGreaterThan3Days ? TimePeriod.Day : TimePeriod.Hour
            };
        }
    }


}

public class LogLevelStat
{
    public DateTime TimeStamp { get; set; }
    public required string LogLevel { get; set; }
    public int Count { get; set; }
}
