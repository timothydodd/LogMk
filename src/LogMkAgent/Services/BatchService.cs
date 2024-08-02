using System.IO.Compression;
using System.Reflection.Metadata;
using System.Text;
using System.Text.Json;
using LogMkCommon;
using Microsoft.Extensions.Options;

namespace LogMkAgent.Services;
public class BatchingService
{
    private readonly object _lock = new object();
    private readonly List<LogLine> _batchData = new List<LogLine>();
    private readonly LogApiClient _httpClient;
    private readonly ILogger<BatchingService> _logger;

    private readonly Timer _timer;

    TimeSpan _interval = TimeSpan.FromSeconds(10);
    public BatchingService(IOptions<ApiSettings> apiSettings, LogApiClient client, ILogger<BatchingService> logger)
    {

        _httpClient = client;
        _logger = logger;

        _timer = new Timer(async _ => await SendBatchAsync(), null, _interval, _interval);

    }
    public void AddData(LogLine data)
    {
        lock (_lock)
        {
            _batchData.Add(data);
        }
    }

    private async Task SendBatchAsync()
    {

        List<LogLine> currentBatch;
        lock (_lock)
        {
            if (_batchData.Count == 0)
                return;
            currentBatch = new List<LogLine>(_batchData);
        }

        _timer.Change(Timeout.Infinite, Timeout.Infinite); // Pause the timer

        try
        {
            var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15)); // Set a short timeout
            var response = await _httpClient.SendDataAsync("api/log", currentBatch, cts.Token);
            response.EnsureSuccessStatusCode();

            lock (_lock)
            {
                _batchData.RemoveAll(currentBatch.Contains); // Clear only the successfully sent data
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, ex.Message);
            // Handle exceptions (e.g., log the error)
        }
        finally
        {
            _timer.Change(_interval, _interval); // Resume the timer
        }
    }


}
public class ApiSettings
{
    public string BaseUrl { get; set; }
}