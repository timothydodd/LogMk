using System.Security.Cryptography;
using System.Text;
using Dapper;
using RoboDodd.OrmLite;

namespace LogMkApi.Services;

/// <summary>
/// One-shot background service that runs on startup to backfill fingerprints
/// for any logs from the past 24 hours that don't have one.
/// </summary>
public class FingerprintBackfillService : BackgroundService
{
    private readonly ILogger<FingerprintBackfillService> _logger;
    private readonly DbConnectionFactory _dbFactory;
    private const int BatchSize = 1000;

    public FingerprintBackfillService(DbConnectionFactory dbFactory, ILogger<FingerprintBackfillService> logger)
    {
        _dbFactory = dbFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small delay to let the rest of the app finish starting
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        try
        {
            await BackfillFingerprintsAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Fingerprint backfill cancelled during shutdown");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during fingerprint backfill");
        }
    }

    private async Task BackfillFingerprintsAsync(CancellationToken stoppingToken)
    {
        var cutoff = DateTime.UtcNow.AddHours(-24);
        long totalUpdated = 0;

        using var db = _dbFactory.CreateConnection();

        // Check how many need backfilling
        var count = await db.ExecuteScalarAsync<long>(
            "SELECT COUNT(*) FROM Log WHERE TimeStamp >= @cutoff AND (Fingerprint IS NULL OR Fingerprint = '')",
            new { cutoff });

        if (count == 0)
        {
            _logger.LogInformation("Fingerprint backfill: no logs need fingerprinting in the past 24 hours");
            return;
        }

        _logger.LogInformation("Fingerprint backfill: {Count} logs from the past 24 hours need fingerprinting", count);

        while (!stoppingToken.IsCancellationRequested)
        {
            var rows = (await db.QueryAsync<BackfillRow>(
                "SELECT Id, Line FROM Log WHERE TimeStamp >= @cutoff AND (Fingerprint IS NULL OR Fingerprint = '') LIMIT @limit",
                new { cutoff, limit = BatchSize })).AsList();

            if (rows.Count == 0)
                break;

            foreach (var row in rows)
            {
                row.Fingerprint = ComputeFingerprint(row.Line);
            }

            await db.ExecuteAsync(
                "UPDATE Log SET Fingerprint = @Fingerprint WHERE Id = @Id",
                rows);

            totalUpdated += rows.Count;

            if (totalUpdated % 10000 == 0 || rows.Count < BatchSize)
            {
                _logger.LogInformation("Fingerprint backfill progress: {Updated}/{Total}", totalUpdated, count);
            }

            // Small yield to avoid monopolizing the connection
            await Task.Delay(50, stoppingToken);
        }

        _logger.LogInformation("Fingerprint backfill complete: {Updated} logs updated", totalUpdated);
    }

    private static string ComputeFingerprint(string line)
    {
        if (string.IsNullOrEmpty(line))
            return string.Empty;

        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(line));
        return Convert.ToHexString(hashBytes, 0, 8).ToLowerInvariant();
    }

    private class BackfillRow
    {
        public long Id { get; set; }
        public string Line { get; set; } = string.Empty;
        public string Fingerprint { get; set; } = string.Empty;
    }
}
