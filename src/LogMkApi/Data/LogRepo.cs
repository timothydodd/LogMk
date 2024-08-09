using System.Text;
using LogMkApi.Common;
using LogMkApi.Data.Models;
using LogMkCommon;
using ServiceStack.Data;
using ServiceStack.OrmLite;
using ServiceStack.OrmLite.Dapper;

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
    public async Task<PagedResults<Log>> GetAll(int offset = 0,
                                                            int pageSize = 100,
                                                            DateTime? dateStart = null,
                                                            DateTime? dateEnd = null,
                                                            string? search = null,
                                                            string? pod = null,
                                                            string? deployment = null,
                                                            string? logLevel = null)
    {
        var result = new PagedResults<Log>();
        var sortOrderBuilder = new List<string>();
        var whereBuilder = new WhereBuilder();
        whereBuilder.AppendAnd(pod, "l.Pod = @pod");
        whereBuilder.AppendAnd(dateStart, "l.TimeStamp >= @dateStart");
        whereBuilder.AppendAnd(dateStart, "l.TimeStamp <= @dateEnd");
        whereBuilder.AppendAnd(deployment, "l.Deployment = @deployment");
        whereBuilder.AppendAnd(logLevel, "l.LogLevel = @logLevel");
        whereBuilder.AppendAnd(pod, "l.Pod = @pod");


        var dynamicParameters = new DynamicParameters();

        dynamicParameters.AddIfNotNull("offset", offset);
        dynamicParameters.AddIfNotNull("pageSize", pageSize);
        dynamicParameters.AddIfNotNull("dateStart", dateStart);
        dynamicParameters.AddIfNotNull("dateEnd", dateEnd);
        dynamicParameters.AddIfNotNull("search", search);
        dynamicParameters.AddIfNotNull("deployment", deployment);
        dynamicParameters.AddIfNotNull("pod", pod);
        dynamicParameters.AddIfNotNull("logLevel", logLevel);

        var likeClause = new AndOrBuilder();
        likeClause.AppendOr(search, "l.Line LIKE '%' + @search + '%'");
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
}
