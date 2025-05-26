using LogMkApi.Common;
using LogMkApi.Data;
using LogMkApi.Data.Models;
using LogMkApi.Hubs;
using LogMkApi.Services;
using LogMkCommon;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ServiceStack;

namespace LogMkApi.Controllers;

[Authorize]
[ApiController]
[Microsoft.AspNetCore.Mvc.Route("api/log")]
public class LogController : ControllerBase
{

    private readonly LogHubService _logHubService;
    private readonly ILogger<LogController> _logger;
    private readonly LogRepo _logRepo;
    private readonly LogSummaryRepo _logSummaryRepo;
    private readonly LogApiMetrics _metrics;
    private readonly int LogMaxDaysOld = 30; // Maximum age of logs to accept
    public LogController(ILogger<LogController> logger, LogRepo logRepo, LogHubService logHubService, LogSummaryRepo logSummaryRepo, LogApiMetrics metrics, IConfiguration configuration)
    {
        _logger = logger;
        _logRepo = logRepo;
        _logHubService = logHubService;
        _logSummaryRepo = logSummaryRepo;
        _metrics = metrics;
        if (configuration != null)
        {
            if (int.TryParse(configuration["LogSettings:MaxDaysOld"], out var maxDays))
            {
                LogMaxDaysOld = maxDays;
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

        var batchId = Guid.NewGuid().ToString("N")[..8];
        var receivedAt = DateTimeOffset.UtcNow;
        var validLogs = new List<Log>();
        var errors = new List<LogValidationError>();
        var skippedCount = 0;

        _logger.LogDebug("Processing batch {BatchId} with {Count} log lines", batchId, logLines.Count);
        _metrics.IncrementLogsReceived(logLines.Count);

        // Process each log line individually - don't let errors stop the batch
        for (int i = 0; i < logLines.Count; i++)
        {
            try
            {
                var logLine = logLines[i];
                var validationResult = ValidateLogLine(logLine, i);

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
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to insert logs for batch {BatchId}", batchId);
                insertErrors.Add($"Database insertion failed: {ex.Message}");
                _metrics.IncrementErrors("database_insert");
            }
        }

        // Send to real-time hub - don't let this fail the API call
        if (insertedCount > 0)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    // Only send recent logs to avoid overwhelming clients
                    var recentLogs = validLogs
                        .Where(l => receivedAt - l.ReceivedAt < TimeSpan.FromMinutes(5))
                        .Take(100) // Limit hub messages
                        .ToList();

                    if (recentLogs.Any())
                    {
                        await _logHubService.SendLogs(recentLogs);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to send logs to hub for batch {BatchId}", batchId);
                }
            }, cancellationToken);
        }

        // Log validation errors for monitoring
        if (errors.Any())
        {
            _logger.LogWarning("Batch {BatchId}: {ErrorCount} validation errors, {SkippedCount} logs skipped",
                batchId, errors.Count, skippedCount);
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

    private LogValidationResult ValidateLogLine(LogLine logLine, int index)
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
                if (logLine.TimeStamp > DateTimeOffset.UtcNow.AddMinutes(5))
                    errors.Add("TimeStamp is too far in the future");

                if (logLine.TimeStamp < DateTimeOffset.UtcNow.AddDays(-LogMaxDaysOld))
                    errors.Add("TimeStamp is too old (>30 days)");

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
                                        [FromQuery] string[]? deployment = null, [FromQuery] string[]? logLevel = null

    )
    {
        var stats = await _logSummaryRepo.GetStatistics(dateStart,
                                                   dateEnd,
                                                   search, podName, deployment, logLevel);
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
                                            [FromQuery] string[]? deployment = null, [FromQuery] string[]? logLevel = null

        )
    {
        var entries = await _logRepo.GetAll((page - 1) * pageSize,
                                                   pageSize,
                                                   dateStart,
                                                   dateEnd,
                                                   search, podName, deployment, logLevel);
        return entries;
    }
    [AllowAnonymous]
    [HttpGet("times")]
    public async Task<IEnumerable<LatestDeploymentEntry>> GetLatestEntryTimes()
    {
        var entries = await _logRepo.GetLatestEntryTimes();
        return entries;
    }
    [HttpGet("pods")]
    public async Task<IEnumerable<Pod>> GetPods()
    {
        var entries = await _logRepo.GetPods();
        return entries;
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
