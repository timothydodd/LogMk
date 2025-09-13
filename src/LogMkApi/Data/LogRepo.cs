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


        var dynamicParameters = new DynamicParameters();

        AddMany(pod, dynamicParameters, whereBuilder, "plp", "l.Pod");
        AddMany(deployment, dynamicParameters, whereBuilder, "dlp", "l.Deployment");
        AddMany(logLevel, dynamicParameters, whereBuilder, "llp", "l.LogLevel");


        if (!string.IsNullOrWhiteSpace(search))
            search = $"%{search}%";



        dynamicParameters.AddIfNotNull("offset", offset);
        dynamicParameters.AddIfNotNull("pageSize", pageSize);
        dynamicParameters.AddIfNotNull("dateStart", dateStart?.Date);
        dynamicParameters.AddIfNotNull("dateStartHour", dateStart?.Hour);
        dynamicParameters.AddIfNotNull("dateEnd", dateEnd?.Date);
        dynamicParameters.AddIfNotNull("dateEndHour", dateEnd?.Hour);

        dynamicParameters.AddIfNotNull("search", search);

        whereBuilder.AppendAnd(dateStart, "l.LogDate >= @dateStart AND (l.LogDate != @dateStart || (l.LogHour >= @dateStartHour))");
        whereBuilder.AppendAnd(dateEnd, "l.LogDate <= @dateEnd  AND (l.LogDate != @dateEnd || (l.LogHour < @dateEndHour)) ");

        var likeClause = new AndOrBuilder();
        likeClause.AppendOr(search, "l.Line LIKE  @search ");
        if (likeClause.Length > 0)
        {
            whereBuilder.AppendAnd($"({likeClause})");
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


}
