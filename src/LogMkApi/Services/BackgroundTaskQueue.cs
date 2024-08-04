using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace LogMkApi.Services;

public class BackgroundTaskQueue : IBackgroundTaskQueue
{
    private readonly Channel<Func<CancellationToken, Task>> _queue;


    public BackgroundTaskQueue(IOptions<BackgroundTaskQueueOptions> options)
    {
        _queue = Channel.CreateBounded<Func<CancellationToken, Task>>(options.Value.Capacity);
    }

    public void QueueBackgroundWorkItem(Func<CancellationToken, Task> workItem)
    {
        if (workItem == null)
        {
            throw new ArgumentNullException(nameof(workItem));
        }

        _queue.Writer.TryWrite(workItem);
    }

    public async Task<Func<CancellationToken, Task>> DequeueAsync(CancellationToken cancellationToken)
    {
        var workItem = await _queue.Reader.ReadAsync(cancellationToken);
        return workItem;
    }
}
public interface IBackgroundTaskQueue
{
    void QueueBackgroundWorkItem(Func<CancellationToken, Task> workItem);
    Task<Func<CancellationToken, Task>> DequeueAsync(CancellationToken cancellationToken);
}
public class BackgroundTaskQueueOptions
{
    public int Capacity { get; set; } = 100; // Default capacity
}
