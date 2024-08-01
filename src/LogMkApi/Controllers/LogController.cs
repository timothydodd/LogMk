﻿using LogMkApi.Data;
using LogMkCommon;
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

    [HttpPost]
    public async Task<ActionResult> Create(List<LogLine> logLine)
    {
        await _logRepo.BulkInsert(logLine.Select(x => new Log
        {
            Deployment = x.DeploymentName,
            Pod = x.PodName,
            Line = x.Line,
            LogLevel = x.LogLevel.ToString(),
            TimeStamp = x.TimeStamp
        }).ToList());
        return Ok();
    }
}
