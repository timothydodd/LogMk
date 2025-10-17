using LogMkApi.Common;
using LogMkApi.Data;
using LogMkApi.Data.Models;
using LogMkApi.Hubs;
using LogMkApi.Services;
using LogMkCommon;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LogMkApi.Controllers;

[Authorize]
[EnableRateLimiting("ApiPolicy")]
[ApiController]
[Microsoft.AspNetCore.Mvc.Route("api/log")]
public class LogController : ControllerBase
{

    private readonly LogHubService _logHubService;
    private readonly ILogger<LogController> _logger;
    private readonly LogRepo _logRepo;
    private readonly LogSummaryRepo _logSummaryRepo;
    private readonly WorkQueueRepo _workQueueRepo;
    private readonly LogApiMetrics _metrics;
    private readonly LogCacheService _cacheService;

    // Configuration: Maximum age limits
    private readonly int LogMaxDaysOld = 30; // For new pods (backfill scenario)
    private readonly int LogMaxMinutesOldForExistingPods = 5; // For existing pods (real-time scenario)
    private readonly bool EnableDuplicateDetection = true;

    public LogController(ILogger<LogController> logger, LogRepo logRepo, LogHubService logHubService,
        LogSummaryRepo logSummaryRepo, WorkQueueRepo workQueueRepo, LogApiMetrics metrics,
        LogCacheService cacheService, IConfiguration configuration)
    {
        _logger = logger;
        _logRepo = logRepo;
        _logHubService = logHubService;
        _logSummaryRepo = logSummaryRepo;
        _workQueueRepo = workQueueRepo;
        _metrics = metrics;
        _cacheService = cacheService;

        if (configuration != null)
        {
            if (int.TryParse(configuration["LogSettings:MaxDaysOld"], out var maxDays))
            {
                LogMaxDaysOld = maxDays;
            }

            if (int.TryParse(configuration["LogSettings:MaxMinutesOldForExistingPods"], out var maxMinutes))
            {
                LogMaxMinutesOldForExistingPods = maxMinutes;
            }

            if (bool.TryParse(configuration["LogSettings:EnableDuplicateDetection"], out var enableDuplicates))
            {
                EnableDuplicateDetection = enableDuplicates;
            }
        }
    }
    [AllowAnonymous]
    [HttpPost]
    public async Task<ActionResult<LogResponse>> Create(
     [FromBody] List<LogLine> logLines,
     CancellationToken cancellationToken = default)
    {
        if (logLines == null || !logLines.Any())
        {
            return BadRequest(new { Error = "No log lines provided" });
        }
        
        // Check for basic model validation errors
        if (!ModelState.IsValid)
        {
            var validationErrors = ModelState
                .Where(x => x.Value?.Errors.Count > 0)
                .ToDictionary(
                    kvp => kvp.Key,
                    kvp => kvp.Value?.Errors.Select(e => e.ErrorMessage).ToArray() ?? Array.Empty<string>()
                );
            return BadRequest(new { Error = "Validation failed", Errors = validationErrors });
        }
        
        // Additional rate limiting for large batches
        if (logLines.Count > 1000)
        {
            return BadRequest(new { Error = "Batch size cannot exceed 1000 log lines" });
        }

        var batchId = Guid.NewGuid().ToString("N")[..8];
        var receivedAt = DateTimeOffset.UtcNow;
        var validLogs = new List<Log>();
        var errors = new List<LogValidationError>();
        var skippedCount = 0;

        _logger.LogDebug("Processing batch {BatchId} with {Count} log lines", batchId, logLines.Count);
        _metrics.IncrementLogsReceived(logLines.Count);

        // Track pods for cache invalidation (new pods that were just inserted)
        var newPods = new HashSet<string>();

        // Process each log line individually - don't let errors stop the batch
        for (int i = 0; i < logLines.Count; i++)
        {
            try
            {
                var logLine = logLines[i];
                var validationResult = await ValidateLogLineAsync(logLine, i);

                if (!validationResult.IsValid)
                {
                    errors.Add(new LogValidationError
                    {
                        Index = i,
                        Errors = validationResult.Errors,
                        LogLine = SanitizeForLogging(logLine)
                    });
                    skippedCount++;
                    continue;
                }

                // Track if this is a new pod
                var podExists = await _cacheService.PodExistsAsync(logLine.PodName);
                if (!podExists)
                {
                    newPods.Add(logLine.PodName);
                }

                // Convert to database entity
                var logEntity = new Log
                {
                    Deployment = logLine.DeploymentName,
                    Pod = logLine.PodName,
                    Line = logLine.Line,
                    LogLevel = logLine.LogLevel.ToString(),
                    TimeStamp = logLine.TimeStamp.UtcDateTime,
                    LogDate = logLine.TimeStamp.UtcDateTime.Date,
                    LogHour = logLine.TimeStamp.UtcDateTime.Hour,
                    SequenceNumber = logLine.SequenceNumber,
                    BatchId = batchId,
                    ReceivedAt = receivedAt.UtcDateTime
                };

                validLogs.Add(logEntity);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error processing log line {Index} in batch {BatchId}", i, batchId);
                errors.Add(new LogValidationError
                {
                    Index = i,
                    Errors = new[] { $"Processing error: {ex.Message}" },
                    LogLine = "Error accessing log line data"
                });
                skippedCount++;
            }
        }

        var insertedCount = 0;
        var insertErrors = new List<string>();

        // Insert valid logs - use resilient insertion strategy
        if (validLogs.Any())
        {
            try
            {
                insertedCount = await InsertLogsResilientlyAsync(validLogs, batchId, cancellationToken);
                _metrics.IncrementLogsProcessed(insertedCount);

                _logger.LogDebug("Successfully inserted {InsertedCount}/{ValidCount} logs for batch {BatchId}",
                    insertedCount, validLogs.Count, batchId);

                // Update cache for successfully inserted logs
                if (insertedCount > 0)
                {
                    // Invalidate pod existence cache for new pods and start backfill tracking
                    foreach (var newPod in newPods)
                    {
                        _cacheService.InvalidatePodExistence(newPod);
                        _cacheService.StartBackfillTracking(newPod);
                        _logger.LogInformation("Started backfill tracking for new pod: {PodName}", newPod);
                    }

                    // Update recent logs cache for all pods in this batch
                    var podGroups = validLogs.GroupBy(log => log.Pod);
                    foreach (var group in podGroups)
                    {
                        _cacheService.UpdateRecentLogsCache(group.Key, group);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to insert logs for batch {BatchId}", batchId);
                insertErrors.Add($"Database insertion failed: {ex.Message}");
                _metrics.IncrementErrors("database_insert");
            }
        }

        // Send to real-time hub
        if (insertedCount > 0)
        {
            try
            {
                // Send all inserted logs for real-time delivery (limit to 500 for safety)
                var logsToSend = validLogs.Take(500).ToList();

                if (logsToSend.Any())
                {
                    await _logHubService.SendLogs(logsToSend);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send logs to hub for batch {BatchId}", batchId);
            }
        }

        // Log validation errors for monitoring
        if (errors.Any())
        {
            // Group errors by type for better insights
            var errorSummary = errors
                .SelectMany(e => e.Errors)
                .GroupBy(error => error)
                .ToDictionary(g => g.Key, g => g.Count());

            _logger.LogWarning("Batch {BatchId}: {ErrorCount} validation errors, {SkippedCount} logs skipped. " +
                "Error breakdown: {ErrorSummary}", 
                batchId, errors.Count, skippedCount, 
                string.Join(", ", errorSummary.Select(kvp => $"{kvp.Key}: {kvp.Value}")));
            
            _metrics.IncrementErrors("validation", skippedCount);
        }

        // Log insert errors
        if (insertErrors.Any())
        {
            foreach (var error in insertErrors)
            {
                _logger.LogError("Batch {BatchId}: Insert error - {Error}", batchId, error);
            }
        }

        // Build response
        var response = new LogResponse
        {
            BatchId = batchId,
            ReceivedCount = logLines.Count,
            ProcessedCount = insertedCount,
            SkippedCount = skippedCount,
            ReceivedAt = receivedAt,
            Status = GetBatchStatus(logLines.Count, insertedCount, skippedCount, insertErrors.Any())
        };

        // Include validation errors if any (but limit them)
        if (errors.Any())
        {
            response.ValidationErrors = errors.Take(10).ToList(); // Limit to first 10 errors
        }

        if (insertErrors.Any())
        {
            response.InsertErrors = insertErrors;
        }

        // Return appropriate status code
        if (insertedCount == 0 && logLines.Count > 0)
        {
            // No logs were inserted
            return BadRequest(response);
        }
        else if (skippedCount > 0 || insertErrors.Any())
        {
            // Partial success
            return StatusCode(206, response); // 206 Partial Content
        }
        else
        {
            // Complete success
            return Ok(response);
        }
    }
    private async Task<int> InsertLogsResilientlyAsync(List<Log> logs, string batchId, CancellationToken cancellationToken)
    {
        try
        {
            // Try bulk insert first (most efficient)
            await _logRepo.InsertAllAsync(logs);
            return logs.Count;
        }
        catch (Exception bulkEx)
        {
            _logger.LogWarning(bulkEx, "Bulk insert failed for batch {BatchId}, falling back to individual inserts", batchId);

            // Fall back to individual inserts to handle constraint violations, etc.
            var insertTasks = logs.Select(async log =>
            {
                try
                {
                    await _logRepo.InsertAsync(log);
                    return 1;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to insert individual log: Pod={Pod}, Seq={Seq}, Deployment={Deployment}",
                        log.Pod, log.SequenceNumber, log.Deployment);
                    return 0;
                }
            });

            var results = await Task.WhenAll(insertTasks);
            return results.Sum();
        }
    }

    private async Task<LogValidationResult> ValidateLogLineAsync(LogLine logLine, int index)
    {
        var errors = new List<string>();

        try
        {
            if (string.IsNullOrWhiteSpace(logLine?.DeploymentName))
                errors.Add("DeploymentName is required");

            if (string.IsNullOrWhiteSpace(logLine?.PodName))
                errors.Add("PodName is required");

            if (string.IsNullOrWhiteSpace(logLine?.Line))
                errors.Add("Line content is required");

            if (logLine?.SequenceNumber <= 0)
                errors.Add("SequenceNumber must be positive");

            if (logLine?.TimeStamp == default)
                errors.Add("TimeStamp is required");

            // Additional validations
            if (logLine != null)
            {
                // Future timestamp check
                if (logLine.TimeStamp > DateTimeOffset.UtcNow.AddMinutes(5))
                    errors.Add("TimeStamp is too far in the future");

                // Conditional timestamp validation based on pod existence and backfill period
                var podExists = await _cacheService.PodExistsAsync(logLine.PodName);
                var isInBackfillPeriod = podExists && _cacheService.IsInBackfillPeriod(logLine.PodName);

                if (!podExists || isInBackfillPeriod)
                {
                    // New pod OR in backfill grace period: allow backfill (30 days)
                    if (logLine.TimeStamp < DateTimeOffset.UtcNow.AddDays(-LogMaxDaysOld))
                    {
                        errors.Add($"TimeStamp is too old (>{LogMaxDaysOld} days)");
                    }
                }
                else
                {
                    // Existing pod outside backfill window: strict real-time validation (5 minutes)
                    if (logLine.TimeStamp < DateTimeOffset.UtcNow.AddMinutes(-LogMaxMinutesOldForExistingPods))
                    {
                        errors.Add($"TimeStamp is too old (>{LogMaxMinutesOldForExistingPods} minutes) for existing pod");
                    }
                }

                // Duplicate detection (if enabled)
                if (EnableDuplicateDetection && podExists)
                {
                    var isDuplicate = await _cacheService.IsDuplicateLogAsync(
                        logLine.PodName,
                        logLine.TimeStamp,
                        logLine.SequenceNumber,
                        logLine.Line);

                    if (isDuplicate)
                    {
                        errors.Add("Duplicate log entry detected");
                    }
                }

                // Length validations
                if (logLine.Line?.Length > 10000)
                    errors.Add("Line content too long (max 10,000 characters)");

                if (logLine.DeploymentName?.Length > 100)
                    errors.Add("DeploymentName too long (max 100 characters)");

                if (logLine.PodName?.Length > 100)
                    errors.Add("PodName too long (max 100 characters)");
            }
        }
        catch (Exception ex)
        {
            errors.Add($"Validation error: {ex.Message}");
        }

        return new LogValidationResult
        {
            IsValid = !errors.Any(),
            Errors = errors.ToArray()
        };
    }

    private string SanitizeForLogging(LogLine logLine)
    {
        try
        {
            if (logLine == null)
                return "null";

            return $"Pod: {logLine.PodName ?? "null"}, " +
                   $"Deployment: {logLine.DeploymentName ?? "null"}, " +
                   $"Seq: {logLine.SequenceNumber}, " +
                   $"Timestamp: {logLine.TimeStamp}";
        }
        catch
        {
            return "Error accessing log line properties";
        }
    }

    private string GetBatchStatus(int received, int processed, int skipped, bool hasInsertErrors)
    {
        if (processed == 0 && received > 0)
            return "Failed";
        else if (processed == received && !hasInsertErrors)
            return "Success";
        else
            return "Partial";
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetLogs(
                                        [FromQuery] DateTime? dateStart = null,
                                        [FromQuery] DateTime? dateEnd = null,
                                        [FromQuery] string? search = null, [FromQuery] string[]? podName = null,
                                        [FromQuery] string[]? deployment = null, [FromQuery] string[]? logLevel = null,
                                        [FromQuery] string? excludeSearch = null, [FromQuery] string[]? excludePodName = null,
                                        [FromQuery] string[]? excludeDeployment = null, [FromQuery] string[]? excludeLogLevel = null

    )
    {
        var stats = await _logSummaryRepo.GetStatistics(dateStart,
                                                   dateEnd,
                                                   search, podName, deployment, logLevel,
                                                   excludeSearch, excludePodName, excludeDeployment, excludeLogLevel);
        if (stats == null)
            return NotFound();

        return Ok(stats);
    }
    [HttpGet()]
    public async Task<PagedResults<Log>> GetLogs([FromQuery] int page = 1,
                                            [FromQuery] int pageSize = 100,
                                            [FromQuery] DateTime? dateStart = null,
                                            [FromQuery] DateTime? dateEnd = null,
                                            [FromQuery] string? search = null, [FromQuery] string[]? podName = null,
                                            [FromQuery] string[]? deployment = null, [FromQuery] string[]? logLevel = null,
                                            [FromQuery] string? excludeSearch = null, [FromQuery] string[]? excludePodName = null,
                                            [FromQuery] string[]? excludeDeployment = null, [FromQuery] string[]? excludeLogLevel = null

        )
    {
        var entries = await _logRepo.GetAll((page - 1) * pageSize,
                                                   pageSize,
                                                   dateStart,
                                                   dateEnd,
                                                   search, podName, deployment, logLevel,
                                                   excludeSearch, excludePodName, excludeDeployment, excludeLogLevel);
        return entries;
    }
    [AllowAnonymous]
    [HttpGet("times")]
    public async Task<IEnumerable<LatestDeploymentEntry>> GetLatestEntryTimes()
    {
        var entries = await _logRepo.GetLatestEntryTimes();
        return entries;
    }

    [AllowAnonymous]
    [HttpGet("counts")]
    public async Task<IEnumerable<DeploymentCount>> GetDeploymentCounts()
    {
        var entries = await _logRepo.GetDeploymentCounts();
        return entries;
    }

    [AllowAnonymous]
    [HttpGet("settings")]
    public IActionResult GetValidationSettings()
    {
        var settings = new LogMkCommon.ValidationSettings
        {
            MaxDaysOld = LogMaxDaysOld,
            MaxMinutesOldForExistingPods = LogMaxMinutesOldForExistingPods,
            MaxFutureMinutes = 5,
            MaxLineLength = 10000,
            MaxDeploymentNameLength = 100,
            MaxPodNameLength = 100,
            DeploymentNamePattern = @"^[a-zA-Z0-9\-._]+$",
            PodNamePattern = @"^[a-zA-Z0-9\-._]+$",
            AllowEmptyLogLevel = false,
            MaxBatchSize = 1000,
            EnableDuplicateDetection = EnableDuplicateDetection,
            Version = "1.1",
            LastUpdated = DateTime.UtcNow
        };

        _logger.LogDebug("Validation settings requested by agent");
        return Ok(settings);
    }
    [HttpGet("pods")]
    public async Task<IEnumerable<Pod>> GetPods()
    {
        var entries = await _logRepo.GetPods();
        return entries;
    }

    [HttpGet("deployment-summaries")]
    public async Task<IActionResult> GetDeploymentSummaries()
    {
        try
        {
            var summaries = await _logSummaryRepo.GetDeploymentSummaries();
            return Ok(summaries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting deployment summaries");
            return StatusCode(500, new { Error = "Failed to retrieve deployment summaries" });
        }
    }

    [HttpGet("pod-summaries")]
    public async Task<IActionResult> GetPodSummaries()
    {
        try
        {
            var summaries = await _logSummaryRepo.GetPodSummaries();
            return Ok(summaries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pod summaries");
            return StatusCode(500, new { Error = "Failed to retrieve pod summaries" });
        }
    }

    [AllowAnonymous]
    [HttpPost("single")]
    public async Task<ActionResult<LogResponse>> CreateSingle(
        [FromBody] SingleLogEntry logEntry,
        CancellationToken cancellationToken = default)
    {
        if (logEntry == null)
        {
            return BadRequest(new { Error = "No log entry provided" });
        }

        if (!ModelState.IsValid)
        {
            var validationErrors = ModelState
                .Where(x => x.Value?.Errors.Count > 0)
                .ToDictionary(
                    kvp => kvp.Key,
                    kvp => kvp.Value?.Errors.Select(e => e.ErrorMessage).ToArray() ?? Array.Empty<string>()
                );
            return BadRequest(new { Error = "Validation failed", Errors = validationErrors });
        }

        var batchId = Guid.NewGuid().ToString("N")[..8];
        var receivedAt = DateTimeOffset.UtcNow;

        _logger.LogDebug("Processing single log entry for Pod: {Pod}, Deployment: {Deployment}", 
            logEntry.Pod, logEntry.Deployment);

        try
        {
            // Parse timestamp from line if not provided
            var timestamp = logEntry.Timestamp ?? ParseTimestampFromLine(logEntry.Line) ?? receivedAt;
            
            // Parse log level from line if not provided
            var logLevel = logEntry.LogLevel ?? ParseLogLevelFromLine(logEntry.Line) ?? LogMkCommon.LogLevel.Any;

            // Validate timestamp
            if (timestamp > DateTimeOffset.UtcNow.AddMinutes(5))
            {
                return BadRequest(new { Error = "Timestamp is too far in the future" });
            }

            if (timestamp < DateTimeOffset.UtcNow.AddDays(-LogMaxDaysOld))
            {
                return BadRequest(new { Error = $"Timestamp is too old (>{LogMaxDaysOld} days)" });
            }

            // Create log entity
            var logEntity = new Log
            {
                Deployment = logEntry.Deployment,
                Pod = logEntry.Pod,
                Line = logEntry.Line,
                LogLevel = logLevel.ToString(),
                TimeStamp = timestamp.UtcDateTime,
                LogDate = timestamp.UtcDateTime.Date,
                LogHour = timestamp.UtcDateTime.Hour,
                SequenceNumber = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), // Auto-generate sequence number
                BatchId = batchId,
                ReceivedAt = receivedAt.UtcDateTime
            };

            // Insert log
            await _logRepo.InsertAsync(logEntity);
            _metrics.IncrementLogsReceived(1);
            _metrics.IncrementLogsProcessed(1);

            _logger.LogDebug("Successfully inserted single log for Pod: {Pod}", logEntry.Pod);

            // Send to real-time hub
            try
            {
                await _logHubService.SendLogs(new List<Log> { logEntity });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send single log to hub");
            }

            var response = new LogResponse
            {
                BatchId = batchId,
                ReceivedCount = 1,
                ProcessedCount = 1,
                SkippedCount = 0,
                ReceivedAt = receivedAt,
                Status = "Success"
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing single log entry for Pod: {Pod}", logEntry.Pod);
            _metrics.IncrementErrors("single_log_insert");

            var response = new LogResponse
            {
                BatchId = batchId,
                ReceivedCount = 1,
                ProcessedCount = 0,
                SkippedCount = 1,
                ReceivedAt = receivedAt,
                Status = "Failed",
                InsertErrors = new List<string> { ex.Message }
            };

            return BadRequest(response);
        }
    }

    private DateTimeOffset? ParseTimestampFromLine(string line)
    {
        return LogParser.ParseTimestamp(line);
    }

    private LogMkCommon.LogLevel? ParseLogLevelFromLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
            return null;

        return LogParser.ParseLogLevel(line);
    }

    [HttpPost("purge")]
    [Obsolete("Use /api/workqueue/purge instead. This endpoint now queues the operation.")]
    public async Task<IActionResult> PurgeLogs([FromBody] PurgeLogsRequest request)
    {
        // Support both deployment and pod-based purging for backward compatibility
        if (string.IsNullOrWhiteSpace(request?.Deployment) && string.IsNullOrWhiteSpace(request?.Pod))
        {
            return BadRequest(new { Error = "Either deployment name or pod name is required" });
        }

        try
        {
            var podName = !string.IsNullOrWhiteSpace(request.Pod) ? request.Pod : request.Deployment;
            
            // Check if there's already a pending or active job for this pod
            if (await _workQueueRepo.HasPendingOrActiveForPodAsync(podName))
            {
                return Conflict(new { Error = "A purge operation is already pending or in progress for this pod" });
            }

            // Estimate records to be deleted
            var estimatedRecords = await _workQueueRepo.EstimateRecordsAsync(podName, request.TimeRange);

            // Create work queue item
            var item = new WorkQueue
            {
                Type = WorkQueueType.LogPurge,
                PodName = podName,
                Deployment = request.Deployment,
                TimeRange = request.TimeRange ?? "all",
                EstimatedRecords = estimatedRecords,
                CreatedBy = User.Identity?.Name
            };

            var created = await _workQueueRepo.CreateAsync(item);

            _logger.LogInformation("Created work queue item {Id} for purging pod {PodName}", created.Id, podName);

            return Ok(new
            {
                Id = created.Id,
                Status = created.Status,
                EstimatedRecords = estimatedRecords,
                Message = $"Purge operation queued successfully. Estimated {estimatedRecords:N0} records to delete."
            });
        }
        catch (Exception ex)
        {
            var identifier = !string.IsNullOrWhiteSpace(request?.Pod) ? request.Pod : request?.Deployment;
            _logger.LogError(ex, "Error queueing purge for {Identifier}", identifier);
            return StatusCode(500, new { Error = "Failed to queue purge operation" });
        }
    }
}



// Response models
public class LogResponse
{
    public string BatchId { get; set; } = string.Empty;
    public int ReceivedCount { get; set; }
    public int ProcessedCount { get; set; }
    public int SkippedCount { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public List<LogValidationError>? ValidationErrors { get; set; }
    public List<string>? InsertErrors { get; set; }
}

public class LogValidationError
{
    public int Index { get; set; }
    public string[] Errors { get; set; } = Array.Empty<string>();
    public string LogLine { get; set; } = string.Empty;
}

public class LogValidationResult
{
    public bool IsValid { get; set; }
    public string[] Errors { get; set; } = Array.Empty<string>();
}

public class PurgeLogsRequest
{
    public string Deployment { get; set; } = string.Empty;
    public string Pod { get; set; } = string.Empty;
    public string TimeRange { get; set; } = "all";
}
