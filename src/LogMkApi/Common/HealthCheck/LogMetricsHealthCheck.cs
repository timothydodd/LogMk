using LogMkApi.Services;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace LogMkApi.HealthChecks;

public class LoggingMetricsHealthCheck : IHealthCheck
{
    private readonly LogApiMetrics _metrics;
    private readonly ILogger<LoggingMetricsHealthCheck> _logger;
    private readonly LoggingHealthOptions _options;

    public LoggingMetricsHealthCheck(
        LogApiMetrics metrics,
        ILogger<LoggingMetricsHealthCheck> logger,
        IOptions<LoggingHealthOptions> options)
    {
        _metrics = metrics;
        _logger = logger;
        _options = options.Value;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var healthData = new Dictionary<string, object>();
            var warnings = new List<string>();
            var errors = new List<string>();

            // 1. Check API metrics
            CheckApiMetrics(healthData, warnings, errors);

            // 2. Check error rates
            CheckErrorRates(healthData, warnings, errors);

            // 3. Check system resources
            CheckSystemResources(healthData, warnings, errors);

            // 4. Check service uptime and recent activity
            CheckServiceHealth(healthData, warnings, errors);

            // Determine overall health status
            var status = DetermineHealthStatus(errors, warnings);

            // Log health check results
            LogHealthCheckResult(status, healthData, warnings, errors);

            return new HealthCheckResult(
                status,
                description: GetHealthDescription(status, warnings, errors),
                data: healthData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Health check failed with exception");
            return new HealthCheckResult(
                HealthStatus.Unhealthy,
                description: $"Health check failed: {ex.Message}",
                exception: ex);
        }
    }

    private void CheckApiMetrics(Dictionary<string, object> healthData, List<string> warnings, List<string> errors)
    {
        var metrics = _metrics.GetMetrics();

        healthData["api_logs_received"] = metrics.LogsReceived;
        healthData["api_logs_processed"] = metrics.LogsProcessed;
        healthData["api_success_rate"] = metrics.SuccessRate;
        healthData["api_total_errors"] = metrics.TotalErrors;
        healthData["api_last_updated"] = metrics.Timestamp;

        // Check success rate (only if we have enough data)
        if (metrics.LogsReceived > 100)
        {
            if (metrics.SuccessRate < _options.MinSuccessRate)
            {
                errors.Add($"Low success rate: {metrics.SuccessRate:P2} (minimum: {_options.MinSuccessRate:P2})");
            }
            else if (metrics.SuccessRate < _options.WarningSuccessRate)
            {
                warnings.Add($"Success rate below optimal: {metrics.SuccessRate:P2}");
            }
        }

        // Check error rate
        var errorRate = metrics.LogsReceived > 0 ? (double)metrics.TotalErrors / metrics.LogsReceived : 0;
        healthData["api_error_rate"] = errorRate;

        if (metrics.LogsReceived > 50 && errorRate > _options.MaxErrorRate)
        {
            errors.Add($"High error rate: {errorRate:P2} (maximum: {_options.MaxErrorRate:P2})");
        }

        // Check if API is receiving requests
        if (metrics.LogsReceived == 0)
        {
            warnings.Add("No log requests received yet");
        }
    }

    private void CheckServiceHealth(Dictionary<string, object> healthData, List<string> warnings, List<string> errors)
    {
        try
        {
            // Service uptime
            var process = System.Diagnostics.Process.GetCurrentProcess();
            var uptime = DateTime.UtcNow - process.StartTime.ToUniversalTime();
            healthData["service_uptime"] = uptime.ToString(@"dd\.hh\:mm\:ss");
            healthData["service_uptime_seconds"] = uptime.TotalSeconds;

            // Thread pool information
            ThreadPool.GetAvailableThreads(out int availableWorkerThreads, out int availableCompletionPortThreads);
            ThreadPool.GetMaxThreads(out int maxWorkerThreads, out int maxCompletionPortThreads);

            healthData["thread_pool_available_workers"] = availableWorkerThreads;
            healthData["thread_pool_max_workers"] = maxWorkerThreads;
            healthData["thread_pool_busy_workers"] = maxWorkerThreads - availableWorkerThreads;

            var busyThreadsPercentage = (double)(maxWorkerThreads - availableWorkerThreads) / maxWorkerThreads;
            healthData["thread_pool_busy_percentage"] = busyThreadsPercentage;

            // Check thread pool pressure
            if (busyThreadsPercentage > _options.MaxThreadPoolBusyPercentage)
            {
                errors.Add($"High thread pool usage: {busyThreadsPercentage:P1} (max: {_options.MaxThreadPoolBusyPercentage:P1})");
            }
            else if (busyThreadsPercentage > _options.WarningThreadPoolBusyPercentage)
            {
                warnings.Add($"Elevated thread pool usage: {busyThreadsPercentage:P1}");
            }

            // Check if service just started (might indicate recent restart)
            if (uptime < TimeSpan.FromMinutes(5))
            {
                warnings.Add($"Service recently started: {uptime.TotalMinutes:F1} minutes ago");
            }

            // Basic API responsiveness check
            var metrics = _metrics.GetMetrics();
            var timeSinceLastMetricUpdate = DateTimeOffset.UtcNow - metrics.Timestamp;
            healthData["time_since_last_metric_update"] = timeSinceLastMetricUpdate.TotalSeconds;

            if (timeSinceLastMetricUpdate > _options.MaxTimeSinceLastMetricUpdate)
            {
                warnings.Add($"Metrics not recently updated: {timeSinceLastMetricUpdate.TotalSeconds:F0} seconds ago");
            }
        }
        catch (Exception ex)
        {
            warnings.Add($"Could not check service health: {ex.Message}");
        }
    }

    private void CheckErrorRates(Dictionary<string, object> healthData, List<string> warnings, List<string> errors)
    {
        var metrics = _metrics.GetMetrics();

        // Analyze error patterns
        var errorBreakdown = metrics.ErrorBreakdown;
        healthData["error_breakdown"] = errorBreakdown;
        healthData["error_types"] = errorBreakdown.Keys.ToList();

        // Check for concerning error patterns
        foreach (var errorType in errorBreakdown)
        {
            var errorCount = errorType.Value;
            var totalRequests = metrics.LogsReceived;

            if (totalRequests > 0)
            {
                var errorRate = (double)errorCount / totalRequests;

                if (errorType.Key == "database_insert" && errorRate > 0.01) // 1% database errors is concerning
                {
                    errors.Add($"High database error rate: {errorRate:P2} ({errorCount} errors)");
                }
                else if (errorType.Key == "validation" && errorRate > 0.1) // 10% validation errors might indicate client issues
                {
                    warnings.Add($"High validation error rate: {errorRate:P2} ({errorCount} errors)");
                }
                else if (errorType.Key == "unexpected" && errorCount > 0)
                {
                    errors.Add($"Unexpected errors detected: {errorCount} errors");
                }
            }
        }

        // Check for error spikes
        var totalErrors = errorBreakdown.Values.Sum();
        if (totalErrors > _options.MaxTotalErrors)
        {
            errors.Add($"High total error count: {totalErrors} (maximum: {_options.MaxTotalErrors})");
        }
    }

    private void CheckSystemResources(Dictionary<string, object> healthData, List<string> warnings, List<string> errors)
    {
        try
        {
            // Memory usage
            var process = System.Diagnostics.Process.GetCurrentProcess();
            var memoryMB = process.WorkingSet64 / 1024 / 1024;
            healthData["memory_usage_mb"] = memoryMB;

            if (memoryMB > _options.MaxMemoryUsageMB)
            {
                errors.Add($"High memory usage: {memoryMB}MB (max: {_options.MaxMemoryUsageMB}MB)");
            }
            else if (memoryMB > _options.WarningMemoryUsageMB)
            {
                warnings.Add($"Elevated memory usage: {memoryMB}MB");
            }

            // CPU usage information
            var cpuTime = process.TotalProcessorTime;
            healthData["total_cpu_time_seconds"] = cpuTime.TotalSeconds;

            // GC information
            var gen0 = GC.CollectionCount(0);
            var gen1 = GC.CollectionCount(1);
            var gen2 = GC.CollectionCount(2);
            var totalMemory = GC.GetTotalMemory(false) / 1024 / 1024; // Convert to MB

            healthData["gc_gen0_collections"] = gen0;
            healthData["gc_gen1_collections"] = gen1;
            healthData["gc_gen2_collections"] = gen2;
            healthData["gc_total_memory_mb"] = totalMemory;

            // Check for excessive GC pressure
            if (gen2 > _options.MaxGen2Collections)
            {
                warnings.Add($"High Gen2 GC collections: {gen2} (max recommended: {_options.MaxGen2Collections})");
            }

            // Check managed memory vs working set
            var managedMemoryMB = totalMemory;
            var unmanagedMemoryMB = memoryMB - managedMemoryMB;
            healthData["managed_memory_mb"] = managedMemoryMB;
            healthData["unmanaged_memory_mb"] = Math.Max(0, unmanagedMemoryMB);

            if (unmanagedMemoryMB > _options.MaxUnmanagedMemoryMB)
            {
                warnings.Add($"High unmanaged memory usage: {unmanagedMemoryMB}MB (max: {_options.MaxUnmanagedMemoryMB}MB)");
            }
        }
        catch (Exception ex)
        {
            warnings.Add($"Could not check system resources: {ex.Message}");
        }
    }



    private HealthStatus DetermineHealthStatus(List<string> errors, List<string> warnings)
    {
        if (errors.Any())
            return HealthStatus.Unhealthy;

        if (warnings.Count >= _options.MaxWarningsForDegraded)
            return HealthStatus.Degraded;

        if (warnings.Any())
            return HealthStatus.Degraded;

        return HealthStatus.Healthy;
    }

    private string GetHealthDescription(HealthStatus status, List<string> warnings, List<string> errors)
    {
        return status switch
        {
            HealthStatus.Healthy => "All logging metrics are within normal ranges",
            HealthStatus.Degraded => $"Some metrics show concerning values: {string.Join("; ", warnings)}",
            HealthStatus.Unhealthy => $"Critical issues detected: {string.Join("; ", errors)}",
            _ => "Unknown health status"
        };
    }

    private void LogHealthCheckResult(HealthStatus status, Dictionary<string, object> healthData, List<string> warnings, List<string> errors)
    {
        var logLevel = status switch
        {
            HealthStatus.Healthy => LogLevel.Debug,
            HealthStatus.Degraded => LogLevel.Warning,
            HealthStatus.Unhealthy => LogLevel.Error,
            _ => LogLevel.Information
        };

        _logger.Log(logLevel, "Health check completed: Status={Status}, Warnings={WarningCount}, Errors={ErrorCount}",
            status, warnings.Count, errors.Count);

        if (warnings.Any())
        {
            _logger.LogWarning("Health check warnings: {Warnings}", string.Join("; ", warnings));
        }

        if (errors.Any())
        {
            _logger.LogError("Health check errors: {Errors}", string.Join("; ", errors));
        }
    }
}

// Configuration options for health check thresholds
public class LoggingHealthOptions
{
    // API metrics thresholds
    public double MinSuccessRate { get; set; } = 0.95; // 95%
    public double WarningSuccessRate { get; set; } = 0.98; // 98%
    public double MaxErrorRate { get; set; } = 0.05; // 5%
    public long MaxTotalErrors { get; set; } = 1000; // Maximum total errors before alert

    // System resource thresholds
    public long MaxMemoryUsageMB { get; set; } = 1000; // 1GB
    public long WarningMemoryUsageMB { get; set; } = 500; // 500MB
    public long MaxUnmanagedMemoryMB { get; set; } = 200; // 200MB unmanaged memory
    public int MaxGen2Collections { get; set; } = 100;

    // Thread pool thresholds
    public double MaxThreadPoolBusyPercentage { get; set; } = 0.8; // 80%
    public double WarningThreadPoolBusyPercentage { get; set; } = 0.6; // 60%

    // Service health thresholds
    public TimeSpan MaxTimeSinceLastMetricUpdate { get; set; } = TimeSpan.FromMinutes(5);
    public int MaxWarningsForDegraded { get; set; } = 3;
}

