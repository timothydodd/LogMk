using System.Text;
using LogMkApi.Common;
using LogMkApi.Data.Models;
using LogMkCommon;
using RoboDodd.OrmLite;
using Dapper;
using static Dapper.SqlMapper;

namespace LogMkApi.Data;


public class LogRepo
{

    public static readonly char[] CharactersToRemoveForNumberTest = { '#', ' ' };
    private readonly DbConnectionFactory _dbFactory;
    public LogRepo(DbConnectionFactory dbFactory)
    {
        _dbFactory = dbFactory;
    }

    public async Task InsertAllAsync(IEnumerable<Log> logs)
    {
        using (var db = _dbFactory.CreateConnection())
        {
            await db.InsertAllAsync(logs);
        }

    }
    public async Task InsertAsync(Log log)
    {
        using (var db = _dbFactory.CreateConnection())
        {
            await db.InsertAsync(log);
        }

    }
    public async Task<IEnumerable<Pod>> GetPods()
    {
        using (var db = _dbFactory.CreateConnection())
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

    private void AddManyExclude<T>(IEnumerable<T>? items, DynamicParameters dynamicParameters, WhereBuilder builder, string paramName, string fieldClause)
    {
        if (items != null && items.Any())
        {
            List<string> keys = dynamicParameters.AddList(items, paramName);
            var ids = string.Join(',', keys);
            builder.AppendAnd($"{fieldClause} NOT IN ({ids})");
        }
    }
    public async Task<PagedResults<Log>> GetAll(int offset = 0,
                                                            int pageSize = 100,
                                                            DateTime? dateStart = null,
                                                            DateTime? dateEnd = null,
                                                            string? search = null,
                                                            string[]? pod = null,
                                                            string[]? deployment = null,
                                                            string[]? logLevel = null,
                                                            string? excludeSearch = null,
                                                            string[]? excludePod = null,
                                                            string[]? excludeDeployment = null,
                                                            string[]? excludeLogLevel = null)
    {
        var result = new PagedResults<Log>();
        var sortOrderBuilder = new List<string>();
        var whereBuilder = new WhereBuilder();


        var dynamicParameters = new DynamicParameters();

        // Include filters
        AddMany(pod, dynamicParameters, whereBuilder, "plp", "l.Pod");
        AddMany(deployment, dynamicParameters, whereBuilder, "dlp", "l.Deployment");
        AddMany(logLevel, dynamicParameters, whereBuilder, "llp", "l.LogLevel");

        // Exclude filters
        AddManyExclude(excludePod, dynamicParameters, whereBuilder, "eplp", "l.Pod");
        AddManyExclude(excludeDeployment, dynamicParameters, whereBuilder, "edlp", "l.Deployment");
        AddManyExclude(excludeLogLevel, dynamicParameters, whereBuilder, "ellp", "l.LogLevel");

        if (!string.IsNullOrWhiteSpace(search))
            search = $"%{search}%";

        if (!string.IsNullOrWhiteSpace(excludeSearch))
            excludeSearch = $"%{excludeSearch}%";



        dynamicParameters.AddIfNotNull("offset", offset);
        dynamicParameters.AddIfNotNull("pageSize", pageSize);
        dynamicParameters.AddIfNotNull("dateStart", dateStart?.Date);
        dynamicParameters.AddIfNotNull("dateStartHour", dateStart?.Hour);
        dynamicParameters.AddIfNotNull("dateEnd", dateEnd?.Date);
        dynamicParameters.AddIfNotNull("dateEndHour", dateEnd?.Hour);

        dynamicParameters.AddIfNotNull("search", search);
        dynamicParameters.AddIfNotNull("excludeSearch", excludeSearch);

        whereBuilder.AppendAnd(dateStart, "l.LogDate >= @dateStart AND (l.LogDate != @dateStart || (l.LogHour >= @dateStartHour))");
        whereBuilder.AppendAnd(dateEnd, "l.LogDate <= @dateEnd  AND (l.LogDate != @dateEnd || (l.LogHour < @dateEndHour)) ");

        // Include search filter
        var likeClause = new AndOrBuilder();
        likeClause.AppendOr(search, "l.Line LIKE  @search ");
        if (likeClause.Length > 0)
        {
            whereBuilder.AppendAnd($"({likeClause})");
        }

        // Exclude search filter
        if (!string.IsNullOrWhiteSpace(excludeSearch))
        {
            whereBuilder.AppendAnd("l.Line NOT LIKE @excludeSearch");
        }

        var queryBase = @"
         select * from Log l    
";



        using (var db = _dbFactory.CreateConnection())
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
            query.AppendLine($" ORDER BY l.TimeStamp DESC,l.SequenceNumber DESC LIMIT @pageSize OFFSET @offset;");
            result.TotalCount = totalCount;
            var qq = query.ToString();
            result.Items = await db.QueryAsync<Log>(qq, dynamicParameters);
            result.Items ??= new List<Log>();

            return result;
        }
    }
    public async Task<IEnumerable<LatestDeploymentEntry>> GetLatestEntryTimes()
    {
        using (var db = _dbFactory.CreateConnection())
        {
            var query = @"
    SELECT Deployment, Pod, MAX(TimeStamp) AS TimeStamp
    FROM Log
    GROUP BY Deployment, Pod
";
            return await db.QueryAsync<LatestDeploymentEntry>(query);
        }
    }

    public async Task<IEnumerable<DeploymentCount>> GetDeploymentCounts()
    {
        using (var db = _dbFactory.CreateConnection())
        {
            var query = @"
    SELECT Deployment, Pod, COUNT(*) AS Count
    FROM Log
    GROUP BY Deployment, Pod
";
            return await db.QueryAsync<DeploymentCount>(query);
        }
    }

    public async Task<int> PurgeLogsByDeployment(string deployment, DateTime? startDate)
    {
        using (var db = _dbFactory.CreateConnection())
        {
            var query = new StringBuilder("DELETE FROM Log WHERE Deployment = @deployment");
            var parameters = new DynamicParameters();
            parameters.Add("deployment", deployment);

            if (startDate.HasValue)
            {
                query.Append(" AND TimeStamp >= @startDate");
                parameters.Add("startDate", startDate.Value);
            }

            var deletedCount = await db.ExecuteAsync(query.ToString(), parameters);
            return deletedCount;
        }
    }

    public async Task<int> PurgeLogsByPod(string pod, DateTime? startDate)
    {
        using (var db = _dbFactory.CreateConnection())
        {
            var query = new StringBuilder("DELETE FROM Log WHERE Pod = @pod");
            var parameters = new DynamicParameters();
            parameters.Add("pod", pod);

            if (startDate.HasValue)
            {
                query.Append(" AND TimeStamp >= @startDate");
                parameters.Add("startDate", startDate.Value);
            }

            var deletedCount = await db.ExecuteAsync(query.ToString(), parameters);
            return deletedCount;
        }
    }

    /// <summary>
    /// Checks if any logs exist for a specific pod
    /// </summary>
    public async Task<bool> PodExistsAsync(string podName)
    {
        using (var db = _dbFactory.CreateConnection())
        {
            var query = "SELECT COUNT(*) FROM Log WHERE Pod = @podName LIMIT 1";
            var count = await db.ExecuteScalarAsync<int>(query, new { podName });
            return count > 0;
        }
    }

    /// <summary>
    /// Gets the most recent logs for a specific pod
    /// </summary>
    public async Task<IEnumerable<Log>> GetRecentLogsForPodAsync(string podName, int limit = 1000)
    {
        using (var db = _dbFactory.CreateConnection())
        {
            var query = @"
                SELECT * FROM Log
                WHERE Pod = @podName
                ORDER BY TimeStamp DESC, SequenceNumber DESC
                LIMIT @limit";
            return await db.QueryAsync<Log>(query, new { podName, limit });
        }
    }

}
