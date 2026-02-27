using System.Collections.Concurrent;
using System.Text.Json;

namespace LogMkAgent.Services;

/// <summary>
/// Persists agent state (file positions, deployment times) to disk so restarts
/// don't re-process already-seen logs.
/// </summary>
public class StateService : IDisposable
{
    private readonly ILogger<StateService> _logger;
    private readonly string _stateFilePath;
    private readonly Timer _saveTimer;
    private readonly object _saveLock = new();
    private bool _dirty;
    private bool _disposed;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    public StateService(ILogger<StateService> logger, IConfiguration configuration)
    {
        _logger = logger;

        // Default to /var/lib/logmk-agent/state.json, configurable via settings
        var statePath = configuration["LogWatcherOptions:StateFilePath"]
            ?? Path.Combine(AppContext.BaseDirectory, "state.json");

        _stateFilePath = statePath;

        // Save state every 30 seconds if dirty
        _saveTimer = new Timer(_ => SaveIfDirty(), null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));

        _logger.LogInformation("StateService initialized with path: {Path}", _stateFilePath);
    }

    public AgentState Load()
    {
        try
        {
            if (!File.Exists(_stateFilePath))
            {
                _logger.LogInformation("No state file found at {Path}, starting fresh", _stateFilePath);
                return new AgentState();
            }

            var json = File.ReadAllText(_stateFilePath);
            var state = JsonSerializer.Deserialize<AgentState>(json, JsonOptions);

            if (state == null)
            {
                _logger.LogWarning("State file at {Path} was empty or invalid, starting fresh", _stateFilePath);
                return new AgentState();
            }

            _logger.LogInformation("Loaded state: {Count} deployment positions from {Path}",
                state.DeploymentPositions.Count, _stateFilePath);

            return state;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load state from {Path}, starting fresh", _stateFilePath);
            return new AgentState();
        }
    }

    public void Save(AgentState state)
    {
        lock (_saveLock)
        {
            try
            {
                var dir = Path.GetDirectoryName(_stateFilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                var json = JsonSerializer.Serialize(state, JsonOptions);
                File.WriteAllText(_stateFilePath, json);

                _dirty = false;
                _logger.LogDebug("State saved: {Count} deployment positions", state.DeploymentPositions.Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to save state to {Path}", _stateFilePath);
            }
        }
    }

    public void MarkDirty() => _dirty = true;

    private void SaveIfDirty()
    {
        // This is called by the timer - the actual save is done by LogWatcher
        // which calls Save() with the current state when dirty
        if (_dirty)
        {
            OnSaveRequested?.Invoke();
        }
    }

    /// <summary>
    /// Event raised when a periodic save should occur. LogWatcher subscribes
    /// to this and calls Save() with the current state.
    /// </summary>
    public event Action? OnSaveRequested;

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _saveTimer?.Dispose();
    }
}

public class AgentState
{
    public Dictionary<string, DeploymentPosition> DeploymentPositions { get; set; } = new();
    public DateTime SavedAt { get; set; } = DateTime.UtcNow;
}

public class DeploymentPosition
{
    public string? FilePath { get; set; }
    public long LastReadPosition { get; set; }
    public DateTime? LastDeploymentTime { get; set; }
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
}
