using System.Timers;

namespace LogMkAgent.Services;
public class BatchingService
{
    private readonly List<string> _batchData = new List<string>();
    private readonly int _batchSize = 10;
    private readonly System.Timers.Timer _timer;
    private readonly TimeSpan _batchInterval = TimeSpan.FromSeconds(10);

    public BatchingService()
    {
        // Set up a timer to trigger sending the batch
        _timer = new System.Timers.Timer(_batchInterval.TotalMilliseconds);
        _timer.Elapsed += SendBatch;
        _timer.AutoReset = true;
        _timer.Enabled = true;
    }

    public void AddData(string data)
    {
        lock (_batchData)
        {
            _batchData.Add(data);
            if (_batchData.Count >= _batchSize)
            {
                SendBatch(this, null);
            }
        }
    }

    private void SendBatch(object sender, ElapsedEventArgs? e)
    {
        List<string>? currentBatch = null;
        lock (_batchData)
        {
            if (_batchData.Count == 0)
                return;

            currentBatch = new List<string>(_batchData);
            _batchData.Clear();
        }

        Task.Run(() => ProcessBatch(currentBatch));
    }

    private void ProcessBatch(List<string> batch)
    {
        // Simulate processing of batch data
        Console.WriteLine($"Processing batch of {batch.Count} items at {DateTime.Now}");
        foreach (var item in batch)
        {
            Console.WriteLine($"Processing: {item}");
        }
    }
}
