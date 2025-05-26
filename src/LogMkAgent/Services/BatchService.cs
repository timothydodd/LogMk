using System.Collections.Concurrent;
using LogMkCommon;
using Microsoft.Extensions.Options;

namespace LogMkAgent.Services;

public class BatchingService : IDisposable
{
    private readonly ConcurrentQueue<LogLine> _batchData = new();
    private readonly LogApiClient _httpClient;
    private readonly ILogger<BatchingService> _logger;
    private readonly BatchingOptions _options;
    private readonly Timer _timer;
    private readonly SemaphoreSlim _sendSemaphore = new(1, 1);
    private readonly CancellationTokenSource _cancellationTokenSource = new();

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

    // Metrics for monitoring
    private long _totalItemsProcessed;
    private long _totalBatchesSent;
    private long _totalFailures;
    private DateTime _lastSuccessfulSend = DateTime.UtcNow;

    private volatile bool _disposed;

    public BatchingService(
        IOptions<BatchingOptions> batchingOptions,
        LogApiClient client,
        ILogger<BatchingService> logger)
    {
        _httpClient = client ?? throw new ArgumentNullException(nameof(client));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _options = batchingOptions?.Value ?? throw new ArgumentNullException(nameof(batchingOptions));

        ValidateOptions();

        _timer = new Timer(
            async _ => await ProcessBatchAsync().ConfigureAwait(false),
            null,
            _options.BatchInterval,
            _options.BatchInterval);

        _logger.LogInformation("BatchingService initialized with interval: {Interval}, max size: {MaxSize}, timeout: {Timeout}",
            _options.BatchInterval, _options.MaxBatchSize, _options.SendTimeout);
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

        _batchData.Enqueue(data);

        // Trigger immediate send if batch is full
        if (_batchData.Count >= _options.MaxBatchSize)
        {
            _ = Task.Run(async () => await ProcessBatchAsync().ConfigureAwait(false),
                _cancellationTokenSource.Token);
        }
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

    private async Task ProcessNewBatchAsync()
    {
        if (_batchData.IsEmpty)
            return;

        var currentBatch = ExtractBatch();
        if (currentBatch.Count == 0)
            return;

        var success = await SendBatchWithRetryAsync(currentBatch, 1).ConfigureAwait(false);

        if (!success)
        {
            // Add to retry queue
            lock (_retryLock)
            {
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

    private async Task<bool> SendBatchWithRetryAsync(List<LogLine> batch, int attemptNumber)
    {
        if (batch.Count == 0)
            return true;

        try
        {
            _logger.LogDebug("Sending batch of {Count} log lines (attempt {Attempt})", batch.Count, attemptNumber);

            using var cts = new CancellationTokenSource(_options.SendTimeout);
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
                cts.Token, _cancellationTokenSource.Token);

            var response = await _httpClient.SendDataAsync("api/log", batch, linkedCts.Token).ConfigureAwait(false);

            if (response.IsSuccessStatusCode)
            {
                Interlocked.Add(ref _totalItemsProcessed, batch.Count);
                Interlocked.Increment(ref _totalBatchesSent);
                _lastSuccessfulSend = DateTime.UtcNow;

                _logger.LogDebug("Successfully sent batch of {Count} log lines", batch.Count);
                return true;
            }
            else
            {
                _logger.LogWarning("HTTP error sending batch: {StatusCode} {ReasonPhrase}",
                    response.StatusCode, response.ReasonPhrase);
                return false;
            }
        }
        catch (TaskCanceledException ex)
        {
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
            _logger.LogWarning("Batch send timed out after {Timeout}", _options.SendTimeout);
            return false;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Network error sending batch (attempt {Attempt})", attemptNumber);
            return false;
        }

        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error sending batch (attempt {Attempt})", attemptNumber);
            return false;
        }
    }

    public async Task FlushAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Flushing remaining batches...");

        // Stop the timer to prevent new batches from being processed
        await _timer.DisposeAsync().ConfigureAwait(false);

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
                PendingRetries = _retryQueue.Count,
                LastSuccessfulSend = _lastSuccessfulSend
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
            _timer?.Dispose();
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
    public TimeSpan BatchInterval { get; set; } = TimeSpan.FromSeconds(10);
    public int MaxBatchSize { get; set; } = 100;
    public TimeSpan SendTimeout { get; set; } = TimeSpan.FromSeconds(30);
}

public class BatchingServiceStats
{
    public int QueuedItems { get; set; }
    public long TotalItemsProcessed { get; set; }
    public long TotalBatchesSent { get; set; }
    public long TotalFailures { get; set; }
    public int PendingRetries { get; set; }
    public DateTime LastSuccessfulSend { get; set; }
}

public class ApiSettings
{
    public string BaseUrl { get; set; } = string.Empty;
}
