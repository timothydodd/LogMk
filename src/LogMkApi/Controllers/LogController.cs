using LogMkApi.Data;
using LogMkApi.Hubs;
using LogMkApi.Services;
using LogMkCommon;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LogMkApi.Controllers;

[ApiController]
[Route("api/log")]
public class LogController : ControllerBase
{

    private readonly LogHubService _logHubService;
    private readonly ILogger<LogController> _logger;
    private readonly LogRepo _logRepo;
    private readonly IBackgroundTaskQueue _taskQueue;
    public LogController(ILogger<LogController> logger, LogRepo logRepo, LogHubService logHubService, IBackgroundTaskQueue taskQueue)
    {
        _logger = logger;
        _logRepo = logRepo;
        _logHubService = logHubService;
        _taskQueue = taskQueue;
    }
    [AllowAnonymous]
    [HttpPost]
    public ActionResult Create([FromBody] List<LogLine> logLine)
    {

        _taskQueue.QueueBackgroundWorkItem(async token =>
        {
            var items = logLine.Select(x =>
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
            });
            await _logRepo.InsertAllAsync(items);


            await _logHubService.SendLogs(items);




        });
        return Ok();
    }
    [HttpGet()]
    public async Task<IEnumerable<Log>> GetLogs()
    {
        var entries = await _logRepo.GetAll();
        return entries;
    }
    [AllowAnonymous]
    [HttpGet("times")]
    public async Task<IEnumerable<LatestDeploymentEntry>> GetLatestEntryTimes()
    {
        var entries = await _logRepo.GetLatestEntryTimes();
        return entries;
    }
}

