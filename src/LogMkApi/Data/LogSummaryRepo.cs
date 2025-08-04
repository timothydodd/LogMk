using System.Text;
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
        dynamicParameters.AddIfNotNull("dateStart", dateStart?.Date);
        dynamicParameters.AddIfNotNull("dateEnd", dateEnd?.Date);
        dynamicParameters.AddIfNotNull("search", search);


        var whereBuilder = new WhereBuilder();
        AddMany(pod, dynamicParameters, whereBuilder, "plp", "Pod");
        AddMany(deployment, dynamicParameters, whereBuilder, "dlp", "Deployment");
        AddMany(logLevel, dynamicParameters, whereBuilder, "llp", "LogLevel");

        var isGreaterThan3Days = dateStart == null ? true : DateTime.UtcNow.Subtract(dateStart.Value).TotalDays > 3;
        var query = "";
        if (isGreaterThan3Days)
        {

            whereBuilder.AppendAnd(dateStart?.Date, "LogDate >= @dateStart");
            whereBuilder.AppendAnd(dateEnd?.Date, "LogDate <= @dateEnd");
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

            var date = dateStart!.Value.Date;
            var hour = dateStart.Value.Hour;

            dynamicParameters.AddIfNotNull("hour", hour);
            whereBuilder.AppendAnd(date, "LogDate >= @dateStart");
            whereBuilder.AppendAnd(hour, "(LogHour >= @hour or LogDate > @dateStart)");


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

    public async Task<IEnumerable<dynamic>> GetDeploymentSummaries()
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = @"
                SELECT 
                    Deployment,
                    SUM(Count) as TotalCount,
                    LogDate as Date,
                    SUM(Count) as DailyCount
                FROM LogSummary
                WHERE LogDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY Deployment, LogDate
                ORDER BY Deployment, LogDate DESC
            ";

            var results = await db.QueryAsync<dynamic>(query);
            
            // Group by deployment and format the response
            var grouped = results.GroupBy(r => r.Deployment)
                .Select(g => new
                {
                    deployment = g.Key,
                    totalCount = g.Sum(x => (long)x.DailyCount),
                    dailyCounts = g.Select(x => new 
                    {
                        date = ((DateTime)x.Date).ToString("yyyy-MM-dd"),
                        count = (long)x.DailyCount
                    }).Take(7).ToList()
                });

            return grouped;
        }
    }

    public async Task<IEnumerable<dynamic>> GetPodSummaries()
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = @"
                SELECT 
                    Pod,
                    Deployment,
                    SUM(Count) as TotalCount,
                    LogDate as Date,
                    SUM(Count) as DailyCount
                FROM LogSummary
                WHERE LogDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY Pod, Deployment, LogDate
                ORDER BY Pod, LogDate DESC
            ";

            var results = await db.QueryAsync<dynamic>(query);
            
            // Group by pod and format the response
            var grouped = results.GroupBy(r => r.Pod)
                .Select(g => new
                {
                    pod = g.Key,
                    deployment = g.First().Deployment,
                    totalCount = g.Sum(x => (long)x.DailyCount),
                    dailyCounts = g.Select(x => new 
                    {
                        date = ((DateTime)x.Date).ToString("yyyy-MM-dd"),
                        count = (long)x.DailyCount
                    }).Take(7).ToList()
                });

            return grouped;
        }
    }

    public async Task PurgeByDeployment(string deployment, DateTime? startDate)
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = new StringBuilder("DELETE FROM LogSummary WHERE Deployment = @deployment");
            var parameters = new DynamicParameters();
            parameters.Add("deployment", deployment);

            if (startDate.HasValue)
            {
                query.Append(" AND LogDate >= @startDate");
                parameters.Add("startDate", startDate.Value.Date);
            }

            await db.ExecuteAsync(query.ToString(), parameters);
        }
    }

    public async Task PurgeHourlyByDeployment(string deployment, DateTime? startDate)
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = new StringBuilder("DELETE FROM LogSummaryHour WHERE Deployment = @deployment");
            var parameters = new DynamicParameters();
            parameters.Add("deployment", deployment);

            if (startDate.HasValue)
            {
                query.Append(" AND LogDate >= @startDate");
                parameters.Add("startDate", startDate.Value.Date);
            }

            await db.ExecuteAsync(query.ToString(), parameters);
        }
    }

    public async Task PurgeByPod(string pod, DateTime? startDate)
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = new StringBuilder("DELETE FROM LogSummary WHERE Pod = @pod");
            var parameters = new DynamicParameters();
            parameters.Add("pod", pod);

            if (startDate.HasValue)
            {
                query.Append(" AND LogDate >= @startDate");
                parameters.Add("startDate", startDate.Value.Date);
            }

            await db.ExecuteAsync(query.ToString(), parameters);
        }
    }

    public async Task PurgeHourlyByPod(string pod, DateTime? startDate)
    {
        using (var db = _dbFactory.OpenDbConnection())
        {
            var query = new StringBuilder("DELETE FROM LogSummaryHour WHERE Pod = @pod");
            var parameters = new DynamicParameters();
            parameters.Add("pod", pod);

            if (startDate.HasValue)
            {
                query.Append(" AND LogDate >= @startDate");
                parameters.Add("startDate", startDate.Value.Date);
            }

            await db.ExecuteAsync(query.ToString(), parameters);
        }
    }


}

public class LogLevelStat
{
    public DateTime TimeStamp { get; set; }
    public required string LogLevel { get; set; }
    public int Count { get; set; }
}
