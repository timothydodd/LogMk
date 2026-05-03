using LogMkApi.Data;
using LogMkCommon;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LogMkApi.Controllers;

[ApiController]
[Route("api/agents")]
[EnableRateLimiting("ApiPolicy")]
public class AgentController : ControllerBase
{
    private readonly AgentRepo _agentRepo;
    private readonly ILogger<AgentController> _logger;

    public AgentController(AgentRepo agentRepo, ILogger<AgentController> logger)
    {
        _agentRepo = agentRepo;
        _logger = logger;
    }

    // Called by agents — anonymous like other agent endpoints. Returns the
    // latest config so changes saved in the web UI are applied on the next
    // heartbeat (no separate poll needed).
    [AllowAnonymous]
    [HttpPost("heartbeat")]
    public async Task<ActionResult<HeartbeatResponse>> Heartbeat([FromBody] AgentHeartbeat heartbeat)
    {
        if (heartbeat == null || string.IsNullOrWhiteSpace(heartbeat.AgentId))
        {
            return BadRequest(new { Error = "AgentId is required" });
        }

        try
        {
            await _agentRepo.UpsertHeartbeatAsync(heartbeat);
            var config = await _agentRepo.GetMergedConfigAsync(heartbeat.AgentId);
            return Ok(new HeartbeatResponse
            {
                ReceivedAt = DateTime.UtcNow,
                Config = config
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to record heartbeat for {AgentId}", heartbeat.AgentId);
            return StatusCode(500, new { Error = "Failed to record heartbeat" });
        }
    }

    [Authorize]
    [HttpGet("global/config")]
    public async Task<ActionResult<AgentConfig>> GetGlobalConfig()
    {
        var config = await _agentRepo.GetGlobalConfigAsync();
        return Ok(config);
    }

    [Authorize]
    [HttpPut("global/config")]
    public async Task<ActionResult<AgentConfig>> UpdateGlobalConfig([FromBody] AgentConfig config)
    {
        if (config == null)
        {
            return BadRequest(new { Error = "Config is required" });
        }

        await _agentRepo.SaveGlobalConfigAsync(config, User.Identity?.Name);
        var saved = await _agentRepo.GetGlobalConfigAsync();
        _logger.LogInformation("Global agent config updated by {User}", User.Identity?.Name);
        return Ok(saved);
    }

    // Called by the web UI to load raw per-agent config for editing.
    // Agents themselves get config via the heartbeat response (merged).
    [Authorize]
    [HttpGet("{agentId}/config")]
    public async Task<ActionResult<AgentConfig>> GetConfig(string agentId)
    {
        if (string.IsNullOrWhiteSpace(agentId))
        {
            return BadRequest(new { Error = "AgentId is required" });
        }

        if (string.Equals(agentId, AgentRepo.GlobalConfigId, StringComparison.Ordinal))
        {
            return BadRequest(new { Error = "Use /api/agents/global/config for global settings" });
        }

        var config = await _agentRepo.GetConfigAsync(agentId);
        return Ok(config);
    }

    [Authorize]
    [HttpGet]
    public async Task<ActionResult<List<AgentInfo>>> GetAll()
    {
        var agents = await _agentRepo.GetAllAsync();
        return Ok(agents);
    }

    [Authorize]
    [HttpGet("{agentId}")]
    public async Task<ActionResult<AgentInfo>> GetById(string agentId)
    {
        var agent = await _agentRepo.GetByIdAsync(agentId);
        if (agent == null) return NotFound();
        return Ok(agent);
    }

    [Authorize]
    [HttpPut("{agentId}/config")]
    public async Task<ActionResult<AgentConfig>> UpdateConfig(string agentId, [FromBody] AgentConfig config)
    {
        if (config == null)
        {
            return BadRequest(new { Error = "Config is required" });
        }

        if (string.Equals(agentId, AgentRepo.GlobalConfigId, StringComparison.Ordinal))
        {
            return BadRequest(new { Error = "Use /api/agents/global/config for global settings" });
        }

        if (config.MaxBatchSize <= 0 || config.MaxBatchSize > 5000)
        {
            return BadRequest(new { Error = "MaxBatchSize must be between 1 and 5000" });
        }

        if (config.MaxBatchesPerMinute <= 0 || config.MaxBatchesPerMinute > 1000)
        {
            return BadRequest(new { Error = "MaxBatchesPerMinute must be between 1 and 1000" });
        }

        if (config.MaxDaysOld <= 0 || config.MaxDaysOld > 365)
        {
            return BadRequest(new { Error = "MaxDaysOld must be between 1 and 365" });
        }

        await _agentRepo.SaveConfigAsync(agentId, config, User.Identity?.Name);
        var saved = await _agentRepo.GetConfigAsync(agentId);
        _logger.LogInformation("Agent config updated for {AgentId} by {User}", agentId, User.Identity?.Name);
        return Ok(saved);
    }
}
