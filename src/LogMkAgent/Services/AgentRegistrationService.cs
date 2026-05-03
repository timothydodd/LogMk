using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using LogMkCommon;

namespace LogMkAgent.Services;

/// <summary>
/// Periodically posts a heartbeat with runtime stats and pulls down the latest
/// agent-specific config so log filtering and batching can be tuned from the
/// web portal without restarting the agent.
/// </summary>
public class AgentRegistrationService : BackgroundService
{
    private readonly LogApiClient _apiClient;
    private readonly BatchingService _batchingService;
    private readonly LogWatcher _logWatcher;
    private readonly ILogger<AgentRegistrationService> _logger;

    private readonly TimeSpan _heartbeatInterval = TimeSpan.FromSeconds(30);
    private readonly TimeSpan _configPollInterval = TimeSpan.FromSeconds(60);

    private readonly DateTime _startedAt = DateTime.UtcNow;
    private readonly string _agentId;
    private readonly string _hostname;
    private readonly string? _version;
    private readonly string? _ipAddress;

    public AgentRegistrationService(
        LogApiClient apiClient,
        BatchingService batchingService,
        LogWatcher logWatcher,
        ILogger<AgentRegistrationService> logger)
    {
        _apiClient = apiClient;
        _batchingService = batchingService;
        _logWatcher = logWatcher;
        _logger = logger;

        _hostname = Environment.MachineName;
        _agentId = _hostname; // DaemonSet → one agent per node, hostname is unique
        _version = Assembly.GetExecutingAssembly().GetName().Version?.ToString();
        _ipAddress = TryGetLocalIp();

        _logger.LogInformation("AgentRegistrationService starting: AgentId={AgentId}, Hostname={Hostname}, Version={Version}",
            _agentId, _hostname, _version);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Pull config once on startup before the regular polling loop
        await PullConfigAsync(stoppingToken).ConfigureAwait(false);

        var lastConfigPull = DateTime.UtcNow;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SendHeartbeatAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Heartbeat failed");
            }

            if (DateTime.UtcNow - lastConfigPull >= _configPollInterval)
            {
                try
                {
                    await PullConfigAsync(stoppingToken).ConfigureAwait(false);
                    lastConfigPull = DateTime.UtcNow;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Config pull failed");
                }
            }

            try
            {
                await Task.Delay(_heartbeatInterval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task SendHeartbeatAsync(CancellationToken cancellationToken)
    {
        var stats = _batchingService.GetStats();
        var heartbeat = new AgentHeartbeat
        {
            AgentId = _agentId,
            Hostname = _hostname,
            Version = _version,
            IpAddress = _ipAddress,
            StartedAt = _startedAt,
            LastBatchSentAt = stats.LastSuccessfulSend,
            QueuedItems = stats.QueuedItems,
            TotalItemsProcessed = stats.TotalItemsProcessed,
            TotalBatchesSent = stats.TotalBatchesSent,
            TotalFailures = stats.TotalFailures,
            TotalDropped = stats.TotalDropped,
            CircuitBreakerState = stats.CircuitBreakerState
        };

        var response = await _apiClient.PostJsonAsync("api/agents/heartbeat", heartbeat, cancellationToken)
                                       .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogDebug("Heartbeat returned non-success status {StatusCode}", response.StatusCode);
        }
    }

    private async Task PullConfigAsync(CancellationToken cancellationToken)
    {
        try
        {
            var config = await _apiClient.GetDataAsync<AgentConfig>($"api/agents/{Uri.EscapeDataString(_agentId)}/config")
                                         .ConfigureAwait(false);

            if (config == null)
            {
                _logger.LogDebug("No agent config returned for {AgentId}", _agentId);
                return;
            }

            _logWatcher.ApplyConfig(config);
            _batchingService.ApplyConfig(config);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogDebug(ex, "Could not reach API to pull config");
        }
    }

    private static string? TryGetLocalIp()
    {
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                foreach (var ip in ni.GetIPProperties().UnicastAddresses)
                {
                    if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                    {
                        return ip.Address.ToString();
                    }
                }
            }
        }
        catch
        {
            // best-effort
        }
        return null;
    }
}
