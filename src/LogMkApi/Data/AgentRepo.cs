using System.Text.Json;
using LogMkApi.Data.Models;
using LogMkCommon;
using RoboDodd.OrmLite;

namespace LogMkApi.Data;

public class AgentRepo
{
    private readonly DbConnectionFactory _dbFactory;
    private readonly ILogger<AgentRepo> _logger;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public AgentRepo(DbConnectionFactory dbFactory, ILogger<AgentRepo> logger)
    {
        _dbFactory = dbFactory;
        _logger = logger;
    }

    public async Task UpsertHeartbeatAsync(AgentHeartbeat heartbeat)
    {
        using var db = _dbFactory.CreateConnection();
        var existing = await db.SingleByIdAsync<AgentRecord>(heartbeat.AgentId);
        var now = DateTime.UtcNow;

        if (existing == null)
        {
            var record = new AgentRecord
            {
                AgentId = heartbeat.AgentId,
                Hostname = heartbeat.Hostname,
                Version = heartbeat.Version,
                IpAddress = heartbeat.IpAddress,
                FirstSeenAt = now,
                LastSeenAt = now,
                StartedAt = heartbeat.StartedAt,
                LastBatchSentAt = heartbeat.LastBatchSentAt,
                QueuedItems = heartbeat.QueuedItems,
                TotalItemsProcessed = heartbeat.TotalItemsProcessed,
                TotalBatchesSent = heartbeat.TotalBatchesSent,
                TotalFailures = heartbeat.TotalFailures,
                TotalDropped = heartbeat.TotalDropped,
                CircuitBreakerState = heartbeat.CircuitBreakerState
            };
            await db.InsertAsync(record);
        }
        else
        {
            existing.Hostname = heartbeat.Hostname;
            existing.Version = heartbeat.Version;
            existing.IpAddress = heartbeat.IpAddress;
            existing.LastSeenAt = now;
            existing.StartedAt = heartbeat.StartedAt;
            existing.LastBatchSentAt = heartbeat.LastBatchSentAt;
            existing.QueuedItems = heartbeat.QueuedItems;
            existing.TotalItemsProcessed = heartbeat.TotalItemsProcessed;
            existing.TotalBatchesSent = heartbeat.TotalBatchesSent;
            existing.TotalFailures = heartbeat.TotalFailures;
            existing.TotalDropped = heartbeat.TotalDropped;
            existing.CircuitBreakerState = heartbeat.CircuitBreakerState;
            await db.UpdateAsync(existing);
        }
    }

    public async Task<List<AgentInfo>> GetAllAsync()
    {
        using var db = _dbFactory.CreateConnection();
        var query = db.From<AgentRecord>().OrderByDescending(x => x.LastSeenAt);
        var records = await db.SelectAsync(query);
        return records.Select(MapToInfo).ToList();
    }

    public async Task<AgentInfo?> GetByIdAsync(string agentId)
    {
        using var db = _dbFactory.CreateConnection();
        var record = await db.SingleByIdAsync<AgentRecord>(agentId);
        return record == null ? null : MapToInfo(record);
    }

    public async Task<AgentConfig> GetConfigAsync(string agentId)
    {
        using var db = _dbFactory.CreateConnection();
        var record = await db.SingleByIdAsync<AgentConfigRecord>(agentId);

        if (record == null || string.IsNullOrWhiteSpace(record.ConfigJson))
        {
            return new AgentConfig { AgentId = agentId };
        }

        try
        {
            var config = JsonSerializer.Deserialize<AgentConfig>(record.ConfigJson, _jsonOptions)
                         ?? new AgentConfig();
            config.AgentId = agentId;
            config.UpdatedAt = AsUtc(record.UpdatedAt);
            config.UpdatedBy = record.UpdatedBy;
            return config;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize agent config for {AgentId}, returning defaults", agentId);
            return new AgentConfig { AgentId = agentId };
        }
    }

    public async Task SaveConfigAsync(string agentId, AgentConfig config, string? updatedBy)
    {
        using var db = _dbFactory.CreateConnection();
        config.AgentId = agentId;
        config.UpdatedAt = DateTime.UtcNow;
        config.UpdatedBy = updatedBy;

        var json = JsonSerializer.Serialize(config, _jsonOptions);

        var existing = await db.SingleByIdAsync<AgentConfigRecord>(agentId);
        if (existing == null)
        {
            await db.InsertAsync(new AgentConfigRecord
            {
                AgentId = agentId,
                ConfigJson = json,
                UpdatedAt = config.UpdatedAt,
                UpdatedBy = updatedBy
            });
        }
        else
        {
            existing.ConfigJson = json;
            existing.UpdatedAt = config.UpdatedAt;
            existing.UpdatedBy = updatedBy;
            await db.UpdateAsync(existing);
        }
    }

    private static AgentInfo MapToInfo(AgentRecord r) => new()
    {
        AgentId = r.AgentId,
        Hostname = r.Hostname,
        Version = r.Version,
        IpAddress = r.IpAddress,
        FirstSeenAt = AsUtc(r.FirstSeenAt),
        LastSeenAt = AsUtc(r.LastSeenAt),
        StartedAt = AsUtc(r.StartedAt),
        LastBatchSentAt = AsUtc(r.LastBatchSentAt),
        QueuedItems = r.QueuedItems,
        TotalItemsProcessed = r.TotalItemsProcessed,
        TotalBatchesSent = r.TotalBatchesSent,
        TotalFailures = r.TotalFailures,
        TotalDropped = r.TotalDropped,
        CircuitBreakerState = r.CircuitBreakerState
    };

    // OrmLite returns DateTime values from MySQL with Kind=Unspecified, which
    // causes System.Text.Json to omit the 'Z' suffix and forces JS clients to
    // guess the timezone. We always store UTC, so re-tag on the way out.
    private static DateTime AsUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static DateTime? AsUtc(DateTime? value) =>
        value.HasValue ? AsUtc(value.Value) : null;
}
