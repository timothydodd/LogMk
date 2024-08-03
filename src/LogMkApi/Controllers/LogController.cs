using LogMkApi.Data;
using LogMkCommon;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LogMkApi.Controllers;

[ApiController]
[Route("api/log")]
public class LogController : ControllerBase
{


    private readonly ILogger<LogController> _logger;
    private readonly LogRepo _logRepo;

    public LogController(ILogger<LogController> logger, LogRepo logRepo)
    {
        _logger = logger;
        _logRepo = logRepo;
    }
    [AllowAnonymous]
    [HttpPost]
    public async Task<ActionResult> Create([FromBody] List<LogLine> logLine)
    {
        await _logRepo.InsertAllAsync(logLine.Select(x =>
        {
            var l = new Log
            {
                Deployment = x.DeploymentName,
                Pod = x.PodName,
                Line = x.Line,
                LogLevel = x.LogLevel.ToString(),
                TimeStamp = x.TimeStamp.UtcDateTime
            };
            return l;
        }));
        return Ok();
    }
    [HttpGet("times")]
    public async Task<IEnumerable<LatestDeploymentEntry>> GetLatestEntryTimes()
    {
        var entries = await _logRepo.GetLatestEntryTimes();
        return entries;
    }
}

