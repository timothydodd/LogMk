using LogMkApi.Data.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace LogMkApi.Hubs;

[Authorize]
public class LogHub : Hub
{
    private readonly LogHubService _logHubService;

    public LogHub(LogHubService logHubService)
    {
        _logHubService = logHubService;
    }

    public override Task OnConnectedAsync()
    {
        _logHubService.RegisterConnection(Context.ConnectionId);
        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _logHubService.RemoveConnection(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Clients call this to set their filter preferences for real-time log delivery.
    /// Only logs matching the filter will be sent to this connection.
    /// Pass null/empty arrays to receive all logs.
    /// </summary>
    public Task SetFilter(ConnectionFilter filter)
    {
        _logHubService.SetFilter(Context.ConnectionId, filter);
        return Task.CompletedTask;
    }

    /// <summary>
    /// Clients call this to clear their filter and receive all logs.
    /// </summary>
    public Task ClearFilter()
    {
        _logHubService.ClearFilter(Context.ConnectionId);
        return Task.CompletedTask;
    }
}

public class ConnectionFilter
{
    public string[]? Deployments { get; set; }
    public string[]? Pods { get; set; }
    public string[]? LogLevels { get; set; }
}

public class LogHubService
{
    private readonly IHubContext<LogHub> _hubContext;
    private readonly ConcurrentDictionary<string, ConnectionFilter?> _connectionFilters = new();
    private readonly ILogger<LogHubService> _logger;

    public LogHubService(IHubContext<LogHub> hubContext, ILogger<LogHubService> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
    }

    public void RegisterConnection(string connectionId)
    {
        _connectionFilters[connectionId] = null; // No filter = receive all
    }

    public void RemoveConnection(string connectionId)
    {
        _connectionFilters.TryRemove(connectionId, out _);
    }

    public void SetFilter(string connectionId, ConnectionFilter filter)
    {
        _connectionFilters[connectionId] = filter;
        _logger.LogDebug("Filter set for connection {ConnectionId}: Deployments={Deployments}, Pods={Pods}, Levels={Levels}",
            connectionId,
            filter.Deployments != null ? string.Join(",", filter.Deployments) : "all",
            filter.Pods != null ? string.Join(",", filter.Pods) : "all",
            filter.LogLevels != null ? string.Join(",", filter.LogLevels) : "all");
    }

    public void ClearFilter(string connectionId)
    {
        _connectionFilters[connectionId] = null;
    }

    public int ConnectionCount => _connectionFilters.Count;

    public async Task SendLogs(IEnumerable<Log> logs)
    {
        var logList = logs.ToList();
        if (logList.Count == 0) return;

        // Group connections by whether they have filters
        var unfilteredConnections = new List<string>();
        var filteredConnections = new List<(string ConnectionId, ConnectionFilter Filter)>();

        foreach (var (connectionId, filter) in _connectionFilters)
        {
            if (filter == null || IsEmptyFilter(filter))
            {
                unfilteredConnections.Add(connectionId);
            }
            else
            {
                filteredConnections.Add((connectionId, filter));
            }
        }

        // Send all logs to unfiltered connections in one batch
        if (unfilteredConnections.Count > 0)
        {
            await _hubContext.Clients.Clients(unfilteredConnections)
                .SendAsync("ReceiveLog", logList);
        }

        // Send filtered logs to each filtered connection
        foreach (var (connectionId, filter) in filteredConnections)
        {
            var filteredLogs = ApplyFilter(logList, filter);
            if (filteredLogs.Count > 0)
            {
                await _hubContext.Clients.Client(connectionId)
                    .SendAsync("ReceiveLog", filteredLogs);
            }
        }
    }

    private static bool IsEmptyFilter(ConnectionFilter filter)
    {
        return (filter.Deployments == null || filter.Deployments.Length == 0)
            && (filter.Pods == null || filter.Pods.Length == 0)
            && (filter.LogLevels == null || filter.LogLevels.Length == 0);
    }

    private static List<Log> ApplyFilter(List<Log> logs, ConnectionFilter filter)
    {
        IEnumerable<Log> result = logs;

        if (filter.Deployments is { Length: > 0 })
        {
            var set = new HashSet<string>(filter.Deployments, StringComparer.OrdinalIgnoreCase);
            result = result.Where(l => set.Contains(l.Deployment));
        }

        if (filter.Pods is { Length: > 0 })
        {
            var set = new HashSet<string>(filter.Pods, StringComparer.OrdinalIgnoreCase);
            result = result.Where(l => set.Contains(l.Pod));
        }

        if (filter.LogLevels is { Length: > 0 })
        {
            var set = new HashSet<string>(filter.LogLevels, StringComparer.OrdinalIgnoreCase);
            result = result.Where(l => set.Contains(l.LogLevel));
        }

        return result.ToList();
    }
}
