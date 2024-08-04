namespace LogMkApi.Services;

public class BackgroundWorkerService : BackgroundService
{
    private readonly IBackgroundTaskQueue _taskQueue;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BackgroundWorkerService> _logger;

    public BackgroundWorkerService(IBackgroundTaskQueue taskQueue, IServiceProvider serviceProvider, ILogger<BackgroundWorkerService> logger)
    {
        _taskQueue = taskQueue;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var workItem = await _taskQueue.DequeueAsync(stoppingToken);

            try
            {
                using (var scope = _serviceProvider.CreateScope())
                {
                    await workItem(stoppingToken);
                }
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Error occurred executing {WorkItem}", workItem);
            }
        }
    }
}
