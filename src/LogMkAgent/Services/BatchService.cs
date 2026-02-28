using System.Collections.Concurrent;
using LogMkCommon;
using Microsoft.Extensions.Options;
using LogMkAgent.Services;

namespace LogMkAgent.Services;

public class BatchingService : IDisposable
{
    private readonly ConcurrentQueue<LogLine> _batchData = new();
    private readonly LogApiClient _httpClient;
    private readonly ILogger<BatchingService> _logger;
    private readonly BatchingOptions _options;
    private readonly SettingsService _settingsService;
    private Timer? _debounceTimer;
    private readonly SemaphoreSlim _sendSemaphore = new(1, 1);
    private readonly CancellationTokenSource _cancellationTokenSource = new();
    private readonly object _timerLock = new();

    // Retry mechanism
    private readonly Queue<BatchItem> _retryQueue = new();
    private readonly object _retryLock = new();
    private const int MaxRetryAttempts = 3;
    private static readonly TimeSpan[] RetryDelays =
    {
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(15)
    };

    // Circuit breaker
    private readonly CircuitBreaker _circuitBreaker;

    // Rate limiting
    private readonly int _maxBatchesPerMinute;
    private readonly Queue<DateTime> _batchSendTimestamps = new();
    private readonly object _rateLimitLock = new();

    // Metrics for monitoring
    private long _totalItemsProcessed;
    private long _totalBatchesSent;
    private long _totalFailures;
    private long _totalValidationFailures;
    private long _totalRateLimitDelays;
    private long _totalDropped;
    private DateTime _lastSuccessfulSend = DateTime.UtcNow;

    // Debounce configuration
    private readonly TimeSpan _debounceDelay = TimeSpan.FromMilliseconds(150); // Send after 150ms of no new logs
    private readonly TimeSpan _maxWaitTime = TimeSpan.FromSeconds(2); // Force send after 2 seconds max
    private DateTime _firstLogAddedTime = DateTime.MinValue;

    // Throttle drop warnings to avoid log spam
    private DateTime _lastDropWarning = DateTime.MinValue;
    private long _dropsSinceLastWarning;

    private volatile bool _disposed;

    public BatchingService(
        IOptions<BatchingOptions> batchingOptions,
        LogApiClient client,
        ILogger<BatchingService> logger,
        SettingsService settingsService)
    {
        _httpClient = client ?? throw new ArgumentNullException(nameof(client));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _options = batchingOptions?.Value ?? throw new ArgumentNullException(nameof(batchingOptions));
        _settingsService = settingsService ?? throw new ArgumentNullException(nameof(settingsService));

        _maxBatchesPerMinute = _options.MaxBatchesPerMinute;
        _circuitBreaker = new CircuitBreaker(logger,
            failureThreshold: _options.CircuitBreakerFailureThreshold,
            cooldownPeriod: _options.CircuitBreakerCooldown);

        ValidateOptions();

        // Configure debounce delay from options if available, otherwise use defaults
        if (_options.BatchInterval < TimeSpan.FromSeconds(5))
        {
            _debounceDelay = TimeSpan.FromMilliseconds(Math.Min(_options.BatchInterval.TotalMilliseconds / 10, 150));
            _maxWaitTime = _options.BatchInterval;
        }

        _logger.LogInformation("BatchingService initialized with debounce: {DebounceDelay}ms, max wait: {MaxWait}s, max size: {MaxSize}, timeout: {Timeout}, rate limit: {RateLimit}/min, max queue: {MaxQueue}, max retry queue: {MaxRetryQueue}",
            _debounceDelay.TotalMilliseconds, _maxWaitTime.TotalSeconds, _options.MaxBatchSize, _options.SendTimeout, _maxBatchesPerMinute, _options.MaxQueueSize, _options.MaxRetryQueueSize);
    }

    private void ValidateOptions()
    {
        if (_options.BatchInterval <= TimeSpan.Zero)
            throw new ArgumentException("BatchInterval must be positive");

        if (_options.MaxBatchSize <= 0)
            throw new ArgumentException("MaxBatchSize must be positive");

        if (_options.SendTimeout <= TimeSpan.Zero)
            throw new ArgumentException("SendTimeout must be positive");
    }

    public void AddData(LogLine data)
    {
        if (_disposed)
        {
            _logger.LogWarning("Attempted to add data to disposed BatchingService");
            return;
        }

        if (data == null)
        {
            _logger.LogWarning("Attempted to add null LogLine to batch");
            return;
        }

        // Enforce queue size limit - drop 10% of queue to make room and avoid per-item churn
        if (_options.MaxQueueSize > 0 && _batchData.Count >= _options.MaxQueueSize)
        {
            var toDrop = Math.Max(1, _options.MaxQueueSize / 10);
            var dropped = 0;
            while (dropped < toDrop && _batchData.TryDequeue(out _))
            {
                dropped++;
            }
            Interlocked.Add(ref _totalDropped, dropped);
            Interlocked.Add(ref _dropsSinceLastWarning, dropped);

            // Throttle warning to at most once per 10 seconds
            var now = DateTime.UtcNow;
            if ((now - _lastDropWarning).TotalSeconds >= 10)
            {
                _logger.LogWarning("Queue at capacity ({MaxSize}), dropped {Dropped} oldest items (total since last warning: {TotalDrops})",
                    _options.MaxQueueSize, dropped, Interlocked.Exchange(ref _dropsSinceLastWarning, 0));
                _lastDropWarning = now;
            }
        }

        _batchData.Enqueue(data);

        // Track when first log was added if this is the first in a batch
        if (_firstLogAddedTime == DateTime.MinValue)
        {
            _firstLogAddedTime = DateTime.UtcNow;
        }

        // Trigger immediate send if batch is full
        if (_batchData.Count >= _options.MaxBatchSize)
        {
            TriggerImmediateSend();
        }
        else
        {
            // Reset the debounce timer
            ResetDebounceTimer();
        }
    }

    private void ResetDebounceTimer()
    {
        lock (_timerLock)
        {
            // Calculate how long we've been waiting
            var waitTime = DateTime.UtcNow - _firstLogAddedTime;

            // If we've been waiting too long, send immediately
            if (_firstLogAddedTime != DateTime.MinValue && waitTime >= _maxWaitTime)
            {
                TriggerImmediateSend();
                return;
            }

            // Create timer if it doesn't exist, otherwise reset it
            if (_debounceTimer == null)
            {
                _debounceTimer = new Timer(
                    _ => TriggerImmediateSend(),
                    null,
                    _debounceDelay,
                    Timeout.InfiniteTimeSpan);
            }
            else
            {
                // Reuse existing timer by changing its due time
                _debounceTimer.Change(_debounceDelay, Timeout.InfiniteTimeSpan);
            }
        }
    }

    private void TriggerImmediateSend()
    {
        lock (_timerLock)
        {
            _debounceTimer?.Dispose();
            _debounceTimer = null;
        }

        _ = Task.Run(async () =>
        {
            await ProcessBatchAsync().ConfigureAwait(false);
            // Reset first log time after processing
            _firstLogAddedTime = DateTime.MinValue;
        }, _cancellationTokenSource.Token);
    }

    private async Task ProcessBatchAsync()
    {
        if (_disposed || _cancellationTokenSource.Token.IsCancellationRequested)
            return;

        if (!await _sendSemaphore.WaitAsync(1000, _cancellationTokenSource.Token).ConfigureAwait(false))
        {
            //_logger.LogDebug("Batch processing already in progress, skipping");
            return;
        }

        try
        {
            await ProcessRetryQueueAsync().ConfigureAwait(false);
            await ProcessNewBatchAsync().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in batch processing");
        }
        finally
        {
            _sendSemaphore.Release();
        }
    }

    private async Task ProcessRetryQueueAsync()
    {
        var itemsToRetry = new List<BatchItem>();

        lock (_retryLock)
        {
            while (_retryQueue.Count > 0)
            {
                var item = _retryQueue.Dequeue();
                if (DateTime.UtcNow >= item.NextRetryTime)
                {
                    itemsToRetry.Add(item);
                }
                else
                {
                    _retryQueue.Enqueue(item); // Put it back for later
                    break; // Items are ordered by retry time
                }
            }
        }

        foreach (var item in itemsToRetry)
        {
            var success = await SendBatchWithRetryAsync(item.Data, item.AttemptNumber).ConfigureAwait(false);
            if (!success)
            {
                lock (_retryLock)
                {
                    if (item.AttemptNumber < MaxRetryAttempts)
                    {
                        item.AttemptNumber++;
                        item.NextRetryTime = DateTime.UtcNow.Add(RetryDelays[Math.Min(item.AttemptNumber - 1, RetryDelays.Length - 1)]);
                        _retryQueue.Enqueue(item);
                        _logger.LogWarning("Batch retry {Attempt}/{Max} scheduled for {RetryTime}",
                            item.AttemptNumber, MaxRetryAttempts, item.NextRetryTime);
                    }
                    else
                    {
                        Interlocked.Add(ref _totalFailures, item.Data.Count);
                        _logger.LogError("Batch permanently failed after {MaxAttempts} attempts, dropping {Count} log lines",
                            MaxRetryAttempts, item.Data.Count);
                    }
                }
            }
        }
    }

    private bool IsRateLimited()
    {
        lock (_rateLimitLock)
        {
            var now = DateTime.UtcNow;
            var windowStart = now.AddMinutes(-1);

            // Remove timestamps outside the sliding window
            while (_batchSendTimestamps.Count > 0 && _batchSendTimestamps.Peek() < windowStart)
            {
                _batchSendTimestamps.Dequeue();
            }

            if (_batchSendTimestamps.Count >= _maxBatchesPerMinute)
            {
                return true;
            }

            _batchSendTimestamps.Enqueue(now);
            return false;
        }
    }

    private async Task ProcessNewBatchAsync()
    {
        if (_batchData.IsEmpty)
            return;

        // Check rate limit before extracting the batch
        if (IsRateLimited())
        {
            Interlocked.Increment(ref _totalRateLimitDelays);
            _logger.LogWarning("Rate limit reached ({MaxBatchesPerMinute}/min), delaying batch send", _maxBatchesPerMinute);
            // Re-trigger after a short delay instead of dropping
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromSeconds(2), _cancellationTokenSource.Token).ConfigureAwait(false);
                ResetDebounceTimer();
            }, _cancellationTokenSource.Token);
            return;
        }

        var currentBatch = ExtractBatch();
        if (currentBatch.Count == 0)
            return;

        // Pre-validate the batch before sending
        var validatedBatch = await ValidateBatchAsync(currentBatch).ConfigureAwait(false);
        if (validatedBatch.Count == 0)
        {
            _logger.LogWarning("Entire batch of {Count} logs failed validation, skipping send", currentBatch.Count);
            return;
        }

        if (validatedBatch.Count < currentBatch.Count)
        {
            _logger.LogInformation("Pre-validation filtered {Filtered} invalid logs from batch of {Total}. Sending {Valid} valid logs.",
                currentBatch.Count - validatedBatch.Count, currentBatch.Count, validatedBatch.Count);
        }

        var success = await SendBatchWithRetryAsync(validatedBatch, 1).ConfigureAwait(false);

        if (!success)
        {
            // Add to retry queue with size enforcement
            lock (_retryLock)
            {
                if (_options.MaxRetryQueueSize > 0)
                {
                    var retryItemCount = _retryQueue.Sum(r => r.Data.Count);
                    if (retryItemCount + currentBatch.Count > _options.MaxRetryQueueSize)
                    {
                        var dropped = currentBatch.Count;
                        Interlocked.Add(ref _totalDropped, dropped);
                        _logger.LogWarning("Retry queue at capacity ({MaxSize} items), dropping batch of {Count} logs",
                            _options.MaxRetryQueueSize, dropped);
                        return;
                    }
                }

                var retryItem = new BatchItem
                {
                    Data = currentBatch,
                    AttemptNumber = 1,
                    NextRetryTime = DateTime.UtcNow.Add(RetryDelays[0])
                };
                _retryQueue.Enqueue(retryItem);
            }
        }
    }

    private List<LogLine> ExtractBatch()
    {
        var batch = new List<LogLine>();
        var maxItems = Math.Min(_options.MaxBatchSize, _batchData.Count);

        for (int i = 0; i < maxItems && _batchData.TryDequeue(out var logLine); i++)
        {
            batch.Add(logLine);
        }

        return batch;
    }

    private async Task<List<LogLine>> ValidateBatchAsync(List<LogLine> batch)
    {
        try
        {
            var validator = await _settingsService.GetValidatorAsync().ConfigureAwait(false);
            if (validator == null)
            {
                _logger.LogWarning("Failed to get validator from settings service, sending batch without pre-validation");
                return batch;
            }

            var validationResult = validator.ValidateBatch(batch);
            
            if (validationResult.InvalidCount > 0)
            {
                Interlocked.Add(ref _totalValidationFailures, validationResult.InvalidCount);
                
                // Log the first few validation errors for diagnostics
                var errorSummary = validationResult.ValidationResults
                    .SelectMany(r => r.Errors)
                    .GroupBy(error => error)
                    .ToDictionary(g => g.Key, g => g.Count());

                _logger.LogWarning("Pre-validation failed for {InvalidCount}/{TotalCount} logs. " +
                    "Error breakdown: {ErrorSummary}",
                    validationResult.InvalidCount, validationResult.TotalCount,
                    string.Join(", ", errorSummary.Select(kvp => $"{kvp.Key}: {kvp.Value}")));
            }

            return validationResult.ValidLogs;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during batch validation, sending batch without pre-validation");
            return batch;
        }
    }

    private async Task<bool> SendBatchWithRetryAsync(List<LogLine> batch, int attemptNumber)
    {
        if (batch.Count == 0)
            return true;

        // Check circuit breaker before attempting to send
        if (!_circuitBreaker.AllowRequest())
        {
            _logger.LogDebug("Circuit breaker is open, skipping batch send of {Count} items", batch.Count);
            return false;
        }

        try
        {
            _logger.LogDebug("Sending batch of {Count} log lines (attempt {Attempt})", batch.Count, attemptNumber);

            using var cts = new CancellationTokenSource(_options.SendTimeout);
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
                cts.Token, _cancellationTokenSource.Token);

            var response = await _httpClient.SendDataAsync("api/log", batch, linkedCts.Token).ConfigureAwait(false);

            var statusCode = (int)response.StatusCode;

            if (response.IsSuccessStatusCode || statusCode == 206)
            {
                // 2xx or 206 Partial — API received and processed the batch
                _circuitBreaker.RecordSuccess();
                Interlocked.Add(ref _totalItemsProcessed, batch.Count);
                Interlocked.Increment(ref _totalBatchesSent);
                _lastSuccessfulSend = DateTime.UtcNow;

                _logger.LogDebug("Successfully sent batch of {Count} log lines (status {StatusCode})", batch.Count, statusCode);
                return true;
            }
            else if (statusCode >= 400 && statusCode < 500)
            {
                // 4xx client error — API received the request but rejected it (validation, duplicates, etc.)
                // Do NOT retry: the same data will get the same response
                _circuitBreaker.RecordSuccess(); // API is reachable, not a connectivity issue
                _logger.LogWarning("Batch rejected by API ({StatusCode} {ReasonPhrase}), not retrying — {Count} logs dropped",
                    response.StatusCode, response.ReasonPhrase, batch.Count);
                Interlocked.Add(ref _totalFailures, batch.Count);
                return true; // Return true to prevent retry
            }
            else
            {
                // 5xx server error — API is having issues, worth retrying
                _circuitBreaker.RecordFailure();
                _logger.LogWarning("Server error sending batch: {StatusCode} {ReasonPhrase}",
                    response.StatusCode, response.ReasonPhrase);
                return false;
            }
        }
        catch (TaskCanceledException ex)
        {
            _circuitBreaker.RecordFailure();
            _logger.LogWarning(ex, "Request cancelled sending batch (attempt {Attempt})", attemptNumber);
            return false;
        }
        catch (OperationCanceledException) when (_cancellationTokenSource.Token.IsCancellationRequested)
        {
            _logger.LogInformation("Batch send cancelled due to service shutdown");
            return false;
        }
        catch (OperationCanceledException)
        {
            _circuitBreaker.RecordFailure();
            _logger.LogWarning("Batch send timed out after {Timeout}", _options.SendTimeout);
            return false;
        }
        catch (HttpRequestException ex)
        {
            _circuitBreaker.RecordFailure();
            _logger.LogWarning(ex, "Network error sending batch (attempt {Attempt})", attemptNumber);
            return false;
        }
        catch (Exception ex)
        {
            _circuitBreaker.RecordFailure();
            _logger.LogError(ex, "Unexpected error sending batch (attempt {Attempt})", attemptNumber);
            return false;
        }
    }

    public async Task FlushAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Flushing remaining batches...");

        // Stop the debounce timer to prevent new batches from being processed
        lock (_timerLock)
        {
            _debounceTimer?.Dispose();
            _debounceTimer = null;
        }

        // Process all remaining data
        while (!_batchData.IsEmpty || HasPendingRetries())
        {
            if (cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning("Flush cancelled, {QueueCount} items remain in queue", _batchData.Count);
                break;
            }

            await ProcessBatchAsync().ConfigureAwait(false);

            // Small delay to avoid tight loop
            await Task.Delay(100, cancellationToken).ConfigureAwait(false);
        }

        _logger.LogInformation("Flush completed. Processed: {Processed}, Sent: {Sent}, Failed: {Failed}",
            _totalItemsProcessed, _totalBatchesSent, _totalFailures);
    }

    private bool HasPendingRetries()
    {
        lock (_retryLock)
        {
            return _retryQueue.Count > 0;
        }
    }

    public BatchingServiceStats GetStats()
    {
        lock (_retryLock)
        {
            return new BatchingServiceStats
            {
                QueuedItems = _batchData.Count,
                TotalItemsProcessed = _totalItemsProcessed,
                TotalBatchesSent = _totalBatchesSent,
                TotalFailures = _totalFailures,
                TotalValidationFailures = _totalValidationFailures,
                TotalRateLimitDelays = _totalRateLimitDelays,
                TotalDropped = _totalDropped,
                PendingRetries = _retryQueue.Count,
                LastSuccessfulSend = _lastSuccessfulSend,
                CircuitBreakerState = _circuitBreaker.State.ToString(),
                CircuitBreakerFailures = _circuitBreaker.ConsecutiveFailures
            };
        }
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;

        try
        {
            _cancellationTokenSource.Cancel();

            // Try to flush remaining data with a reasonable timeout
            var flushTask = FlushAsync(_cancellationTokenSource.Token);
            if (!flushTask.Wait(TimeSpan.FromSeconds(30)))
            {
                _logger.LogWarning("Flush timeout during disposal, some data may be lost");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during BatchingService disposal");
        }
        finally
        {
            lock (_timerLock)
            {
                _debounceTimer?.Dispose();
            }
            _sendSemaphore?.Dispose();
            _cancellationTokenSource?.Dispose();
        }
    }

    private class BatchItem
    {
        public List<LogLine> Data { get; set; } = new();
        public int AttemptNumber { get; set; }
        public DateTime NextRetryTime { get; set; }
    }
}

public class BatchingOptions
{
    public TimeSpan BatchInterval { get; set; } = TimeSpan.FromSeconds(2); // Now acts as max wait time
    public int MaxBatchSize { get; set; } = 500;
    public TimeSpan SendTimeout { get; set; } = TimeSpan.FromSeconds(30);
    public int MaxBatchesPerMinute { get; set; } = 120;
    public int MaxQueueSize { get; set; } = 10000;
    public int MaxRetryQueueSize { get; set; } = 5000;
    public int CircuitBreakerFailureThreshold { get; set; } = 5;
    public TimeSpan CircuitBreakerCooldown { get; set; } = TimeSpan.FromSeconds(30);
}

public class BatchingServiceStats
{
    public int QueuedItems { get; set; }
    public long TotalItemsProcessed { get; set; }
    public long TotalBatchesSent { get; set; }
    public long TotalFailures { get; set; }
    public long TotalValidationFailures { get; set; }
    public long TotalRateLimitDelays { get; set; }
    public long TotalDropped { get; set; }
    public int PendingRetries { get; set; }
    public DateTime LastSuccessfulSend { get; set; }
    public string CircuitBreakerState { get; set; } = string.Empty;
    public int CircuitBreakerFailures { get; set; }
}

public class ApiSettings
{
    public string BaseUrl { get; set; } = string.Empty;
}
