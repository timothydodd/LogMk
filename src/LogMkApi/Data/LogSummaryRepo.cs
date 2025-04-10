using LogMkApi.Common;
using ServiceStack.Data;
using ServiceStack.OrmLite.Dapper;
using static ServiceStack.OrmLite.Dapper.SqlMapper;

namespace LogMkApi.Data;


public class LogSummaryRepo
{

    public static readonly char[] CharactersToRemoveForNumberTest = { '#', ' ' };
    private readonly IDbConnectionFactory _dbFactory;
    public LogSummaryRepo(IDbConnectionFactory dbFactory)
    {
        _dbFactory = dbFactory;
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

    public async Task<LogStatistic> GetStatistics(DateTime? dateStart = null,
                                                            DateTime? dateEnd = null,
                                                            string? search = null,
                                                            string[]? pod = null,
                                                            string[]? deployment = null,
                                                            string[]? logLevel = null)
    {

        var dynamicParameters = new DynamicParameters();



        if (!string.IsNullOrWhiteSpace(search))
            search = $"%{search}%";
        dynamicParameters.AddIfNotNull("dateStart", dateStart);
        dynamicParameters.AddIfNotNull("dateEnd", dateEnd);
        dynamicParameters.AddIfNotNull("search", search);


        var whereBuilder = new WhereBuilder();
        AddMany(pod, dynamicParameters, whereBuilder, "plp", "Pod");
        AddMany(deployment, dynamicParameters, whereBuilder, "dlp", "Deployment");
        AddMany(logLevel, dynamicParameters, whereBuilder, "llp", "LogLevel");

        var isGreaterThan3Days = dateStart == null ? true : DateTime.UtcNow.Subtract(dateStart.Value).TotalDays > 3;
        var query = "";
        if (isGreaterThan3Days)
        {
            whereBuilder.AppendAnd(dateStart, "LogDate >= @dateStart");
            whereBuilder.AppendAnd(dateEnd, "LogDate <= @dateEnd");
            query = $@"
SELECT 
    LogDate AS TimeStamp,
    LogLevel,
    SUM(Count) AS Count
FROM 
    LogSummary
{whereBuilder}
GROUP BY 
    LogDate, LogLevel
ORDER BY 
    LogDate, LogLevel;
";
        }
        else
        {

            whereBuilder.AppendAnd(dateStart, "LogDate >= @dateStart");
            whereBuilder.AppendAnd(dateEnd, "LogDate <= @dateEnd");


            query = $@"
            SELECT 
                DATE_ADD(LogDate, INTERVAL LogHour HOUR) AS TimeStamp,
                LogLevel,
                COUNT(*) AS Count
            FROM 
                LogSummaryHour
                {whereBuilder}
            GROUP BY 
                LogDate, LogHour, LogLevel
            ORDER BY 
                LogDate, LogHour, LogLevel;
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
