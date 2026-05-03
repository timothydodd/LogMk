using System.Net.Http.Json;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Text.Json;
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

    private readonly TimeSpan _heartbeatInterval = TimeSpan.FromSeconds(60);

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        TypeInfoResolver = new ApiJsonSerializerContext(),
        PropertyNameCaseInsensitive = true
    };

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

        // Stamp every outgoing log line with this agent's id so the API/UI
        // can show which node a log came from.
        _batchingService.AgentId = _agentId;

        _logger.LogInformation("AgentRegistrationService starting: AgentId={AgentId}, Hostname={Hostname}, Version={Version}",
            _agentId, _hostname, _version);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Send an initial heartbeat right away so the agent's config is applied
        // before the first batch is processed.
        try
        {
            await SendHeartbeatAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Initial heartbeat failed");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(_heartbeatInterval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            try
            {
                await SendHeartbeatAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Heartbeat failed");
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
            return;
        }

        try
        {
            var payload = await response.Content
                .ReadFromJsonAsync<HeartbeatResponse>(_jsonOptions, cancellationToken)
                .ConfigureAwait(false);

            if (payload?.Config != null)
            {
                _logWatcher.ApplyConfig(payload.Config);
                _batchingService.ApplyConfig(payload.Config);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to parse heartbeat response");
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
