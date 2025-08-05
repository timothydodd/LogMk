using LogMkApi.Data;
using LogMkApi.Data.Models;
using LogMkCommon;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace LogMkApi.Controllers;

[Authorize]
[ApiController]
[Route("api/workqueue")]
public class WorkQueueController : ControllerBase
{
    private readonly WorkQueueRepo _workQueueRepo;
    private readonly ILogger<WorkQueueController> _logger;

    public WorkQueueController(WorkQueueRepo workQueueRepo, ILogger<WorkQueueController> logger)
    {
        _workQueueRepo = workQueueRepo;
        _logger = logger;
    }

    [HttpPost("purge")]
    public async Task<IActionResult> QueuePurge([FromBody] CreateWorkQueueItemRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.PodName))
        {
            return BadRequest(new { Error = "Pod name is required" });
        }

        try
        {
            // Check if there's already a pending or active job for this pod
            if (await _workQueueRepo.HasPendingOrActiveForPodAsync(request.PodName))
            {
                return Conflict(new { Error = "A purge operation is already pending or in progress for this pod" });
            }

            // Estimate records to be deleted
            var estimatedRecords = await _workQueueRepo.EstimateRecordsAsync(request.PodName, request.TimeRange);

            var item = new WorkQueue
            {
                Type = WorkQueueType.LogPurge,
                PodName = request.PodName,
                Deployment = request.Deployment,
                TimeRange = request.TimeRange ?? "all",
                EstimatedRecords = estimatedRecords,
                CreatedBy = User.Identity?.Name,
                Metadata = request.Metadata != null ? JsonSerializer.Serialize(request.Metadata) : null
            };

            var created = await _workQueueRepo.CreateAsync(item);

            _logger.LogInformation("Created work queue item {Id} for purging pod {PodName}", created.Id, request.PodName);

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
            _logger.LogError(ex, "Error queueing purge for pod {PodName}", request.PodName);
            return StatusCode(500, new { Error = "Failed to queue purge operation" });
        }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? limit = 50)
    {
        try
        {
            var items = await _workQueueRepo.GetAllAsync(limit);
            var response = items.Select(MapToResponse).ToList();
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting work queue items");
            return StatusCode(500, new { Error = "Failed to retrieve work queue items" });
        }
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        try
        {
            var items = await _workQueueRepo.GetActiveAsync();
            var response = items.Select(MapToResponse).ToList();
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting active work queue items");
            return StatusCode(500, new { Error = "Failed to retrieve active work queue items" });
        }
    }

    [HttpGet("pod/{podName}")]
    public async Task<IActionResult> GetByPod(string podName)
    {
        try
        {
            var hasPending = await _workQueueRepo.HasPendingOrActiveForPodAsync(podName);
            var items = await _workQueueRepo.GetByPodAsync(podName);
            
            return Ok(new
            {
                HasPendingOrActive = hasPending,
                Items = items.Select(MapToResponse).ToList()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting work queue items for pod {PodName}", podName);
            return StatusCode(500, new { Error = "Failed to retrieve work queue items" });
        }
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        try
        {
            var status = await _workQueueRepo.GetStatusSummaryAsync();
            return Ok(status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting work queue status");
            return StatusCode(500, new { Error = "Failed to retrieve work queue status" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Cancel(int id)
    {
        try
        {
            var success = await _workQueueRepo.CancelAsync(id);
            
            if (!success)
            {
                return BadRequest(new { Error = "Cannot cancel this item. It may already be in progress or completed." });
            }

            _logger.LogInformation("Cancelled work queue item {Id}", id);
            return Ok(new { Message = "Work queue item cancelled successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cancelling work queue item {Id}", id);
            return StatusCode(500, new { Error = "Failed to cancel work queue item" });
        }
    }

    private WorkQueueItemResponse MapToResponse(WorkQueue item)
    {
        return new WorkQueueItemResponse
        {
            Id = item.Id,
            Type = item.Type,
            Status = item.Status,
            PodName = item.PodName,
            Deployment = item.Deployment,
            TimeRange = item.TimeRange,
            CreatedAt = item.CreatedAt,
            StartedAt = item.StartedAt,
            CompletedAt = item.CompletedAt,
            ErrorMessage = item.ErrorMessage,
            RecordsAffected = item.RecordsAffected,
            EstimatedRecords = item.EstimatedRecords,
            Progress = item.Progress,
            CreatedBy = item.CreatedBy
        };
    }
}