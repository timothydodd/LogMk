namespace LogMkAgent.Services;

/// <summary>
/// Simple circuit breaker that tracks consecutive failures and stops sending
/// when the API appears to be down, preventing queue buildup and log spam.
/// </summary>
public class CircuitBreaker
{
    private readonly ILogger _logger;
    private readonly int _failureThreshold;
    private readonly TimeSpan _cooldownPeriod;

    private int _consecutiveFailures;
    private DateTime _circuitOpenedAt = DateTime.MinValue;
    private CircuitState _state = CircuitState.Closed;
    private readonly object _lock = new();

    public CircuitBreaker(ILogger logger, int failureThreshold = 5, TimeSpan? cooldownPeriod = null)
    {
        _logger = logger;
        _failureThreshold = failureThreshold;
        _cooldownPeriod = cooldownPeriod ?? TimeSpan.FromSeconds(30);
    }

    public CircuitState State
    {
        get
        {
            lock (_lock)
            {
                if (_state == CircuitState.Open && DateTime.UtcNow - _circuitOpenedAt >= _cooldownPeriod)
                {
                    _state = CircuitState.HalfOpen;
                    _logger.LogInformation("Circuit breaker transitioning to half-open after {Cooldown}s cooldown", _cooldownPeriod.TotalSeconds);
                }
                return _state;
            }
        }
    }

    /// <summary>
    /// Returns true if the circuit allows a request to pass through.
    /// </summary>
    public bool AllowRequest()
    {
        var state = State; // triggers half-open transition check
        return state != CircuitState.Open;
    }

    /// <summary>
    /// Record a successful API call. Resets the circuit to closed.
    /// </summary>
    public void RecordSuccess()
    {
        lock (_lock)
        {
            if (_state == CircuitState.HalfOpen)
            {
                _logger.LogInformation("Circuit breaker closed after successful request");
            }
            _consecutiveFailures = 0;
            _state = CircuitState.Closed;
        }
    }

    /// <summary>
    /// Record a failed API call. Opens the circuit after threshold reached.
    /// </summary>
    public void RecordFailure()
    {
        lock (_lock)
        {
            _consecutiveFailures++;

            if (_state == CircuitState.HalfOpen)
            {
                // Failed during half-open probe, re-open
                _state = CircuitState.Open;
                _circuitOpenedAt = DateTime.UtcNow;
                _logger.LogWarning("Circuit breaker re-opened after half-open probe failed (failures: {Failures})", _consecutiveFailures);
                return;
            }

            if (_consecutiveFailures >= _failureThreshold && _state == CircuitState.Closed)
            {
                _state = CircuitState.Open;
                _circuitOpenedAt = DateTime.UtcNow;
                _logger.LogWarning(
                    "Circuit breaker OPENED after {Failures} consecutive failures. Will retry after {Cooldown}s",
                    _consecutiveFailures, _cooldownPeriod.TotalSeconds);
            }
        }
    }

    public int ConsecutiveFailures
    {
        get { lock (_lock) return _consecutiveFailures; }
    }
}

public enum CircuitState
{
    Closed,   // Normal operation
    Open,     // Blocking requests
    HalfOpen  // Allowing one test request
}
