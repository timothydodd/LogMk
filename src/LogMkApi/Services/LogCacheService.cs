using LogMkApi.Data;
using LogMkApi.Data.Models;
using Microsoft.Extensions.Caching.Memory;
using System.Collections.Concurrent;

namespace LogMkApi.Services;

/// <summary>
/// Caches pod metadata and recent log entries to optimize validation and prevent duplicates
/// </summary>
public class LogCacheService
{
    private readonly IMemoryCache _cache;
    private readonly LogRepo _logRepo;
    private readonly ILogger<LogCacheService> _logger;
    private readonly int _backfillGracePeriodMinutes;

    // Cache configuration
    private const int RecentLogsCacheSize = 1000; // Number of recent logs to cache per pod
    private const int PodExistenceCacheDurationMinutes = 60; // How long to cache pod existence
    private const int RecentLogsCacheDurationMinutes = 10; // How long to cache recent logs

    public LogCacheService(IMemoryCache cache, LogRepo logRepo, ILogger<LogCacheService> logger, IConfiguration configuration)
    {
        _cache = cache;
        _logRepo = logRepo;
        _logger = logger;

        // Read backfill grace period from configuration
        _backfillGracePeriodMinutes = 15; // Default
        if (configuration != null && int.TryParse(configuration["LogSettings:BackfillGracePeriodMinutes"], out var gracePeriod))
        {
            _backfillGracePeriodMinutes = gracePeriod;
        }

        _logger.LogInformation("LogCacheService initialized - Backfill grace period: {Minutes} minutes", _backfillGracePeriodMinutes);
    }

    /// <summary>
    /// Checks if a pod exists in the database (with caching)
    /// </summary>
    public async Task<bool> PodExistsAsync(string podName)
    {
        var cacheKey = $"pod_exists:{podName}";

        if (_cache.TryGetValue(cacheKey, out bool exists))
        {
            return exists;
        }

        // Check database
        exists = await _logRepo.PodExistsAsync(podName);

        // Cache the result
        var cacheOptions = new MemoryCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(PodExistenceCacheDurationMinutes));

        _cache.Set(cacheKey, exists, cacheOptions);

        _logger.LogDebug("Pod existence cached for {PodName}: {Exists}", podName, exists);

        return exists;
    }

    /// <summary>
    /// Invalidates the pod existence cache for a specific pod
    /// </summary>
    public void InvalidatePodExistence(string podName)
    {
        var cacheKey = $"pod_exists:{podName}";
        _cache.Remove(cacheKey);
        _logger.LogDebug("Pod existence cache invalidated for {PodName}", podName);
    }

    /// <summary>
    /// Starts tracking backfill period for a new pod
    /// </summary>
    public void StartBackfillTracking(string podName)
    {
        var cacheKey = $"backfill_start:{podName}";
        var backfillStartTime = DateTimeOffset.UtcNow;

        var cacheOptions = new MemoryCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(_backfillGracePeriodMinutes));

        _cache.Set(cacheKey, backfillStartTime, cacheOptions);

        _logger.LogInformation("Started backfill tracking for {PodName} - Grace period: {Minutes} minutes",
            podName, _backfillGracePeriodMinutes);
    }

    /// <summary>
    /// Checks if a pod is currently in backfill grace period
    /// </summary>
    public bool IsInBackfillPeriod(string podName)
    {
        var cacheKey = $"backfill_start:{podName}";

        if (_cache.TryGetValue(cacheKey, out DateTimeOffset backfillStartTime))
        {
            var elapsed = DateTimeOffset.UtcNow - backfillStartTime;
            var isInPeriod = elapsed.TotalMinutes < _backfillGracePeriodMinutes;

            if (isInPeriod)
            {
                _logger.LogDebug("Pod {PodName} is in backfill period - Elapsed: {Elapsed:0.0} minutes of {Total} minutes",
                    podName, elapsed.TotalMinutes, _backfillGracePeriodMinutes);
            }

            return isInPeriod;
        }

        return false;
    }

    /// <summary>
    /// Gets recent logs for a pod from cache or database
    /// </summary>
    public async Task<List<LogCacheEntry>> GetRecentLogsAsync(string podName, int count = RecentLogsCacheSize)
    {
        var cacheKey = $"recent_logs:{podName}";

        if (_cache.TryGetValue(cacheKey, out List<LogCacheEntry>? cachedLogs) && cachedLogs != null)
        {
            return cachedLogs;
        }

        // Fetch from database
        var logs = await _logRepo.GetRecentLogsForPodAsync(podName, count);

        var cacheEntries = logs.Select(log => new LogCacheEntry
        {
            PodName = log.Pod,
            TimeStamp = log.TimeStamp,
            SequenceNumber = log.SequenceNumber,
            LineHash = GetLogHash(log.Line, log.TimeStamp, log.SequenceNumber)
        }).ToList();

        // Cache the results
        var cacheOptions = new MemoryCacheEntryOptions()
            .SetSlidingExpiration(TimeSpan.FromMinutes(RecentLogsCacheDurationMinutes))
            .SetSize(1); // For memory management

        _cache.Set(cacheKey, cacheEntries, cacheOptions);

        _logger.LogDebug("Cached {Count} recent logs for {PodName}", cacheEntries.Count, podName);

        return cacheEntries;
    }

    /// <summary>
    /// Checks if a log entry is a duplicate based on cached recent logs
    /// </summary>
    public async Task<bool> IsDuplicateLogAsync(string podName, DateTimeOffset timestamp, long sequenceNumber, string line)
    {
        var recentLogs = await GetRecentLogsAsync(podName);

        if (!recentLogs.Any())
        {
            return false;
        }

        var logHash = GetLogHash(line, timestamp.UtcDateTime, sequenceNumber);

        // Check for exact duplicate by hash
        if (recentLogs.Any(log => log.LineHash == logHash))
        {
            _logger.LogDebug("Duplicate log detected for {PodName} - Hash: {Hash}", podName, logHash);
            return true;
        }

        // Check for duplicate by timestamp + sequence number (primary key combination)
        if (recentLogs.Any(log => log.TimeStamp == timestamp.UtcDateTime && log.SequenceNumber == sequenceNumber))
        {
            _logger.LogDebug("Duplicate log detected for {PodName} - Timestamp: {Timestamp}, Seq: {Seq}",
                podName, timestamp, sequenceNumber);
            return true;
        }

        return false;
    }

    /// <summary>
    /// Updates the recent logs cache with newly inserted logs
    /// </summary>
    public void UpdateRecentLogsCache(string podName, IEnumerable<Log> newLogs)
    {
        var cacheKey = $"recent_logs:{podName}";

        if (!_cache.TryGetValue(cacheKey, out List<LogCacheEntry>? cachedLogs))
        {
            // Cache doesn't exist yet, don't create it here
            return;
        }

        if (cachedLogs == null)
        {
            cachedLogs = new List<LogCacheEntry>();
        }

        // Add new logs to cache
        var newEntries = newLogs.Select(log => new LogCacheEntry
        {
            PodName = log.Pod,
            TimeStamp = log.TimeStamp,
            SequenceNumber = log.SequenceNumber,
            LineHash = GetLogHash(log.Line, log.TimeStamp, log.SequenceNumber)
        }).ToList();

        cachedLogs.AddRange(newEntries);

        // Keep only the most recent logs (sorted by timestamp descending)
        cachedLogs = cachedLogs
            .OrderByDescending(log => log.TimeStamp)
            .ThenByDescending(log => log.SequenceNumber)
            .Take(RecentLogsCacheSize)
            .ToList();

        // Update cache
        var cacheOptions = new MemoryCacheEntryOptions()
            .SetSlidingExpiration(TimeSpan.FromMinutes(RecentLogsCacheDurationMinutes))
            .SetSize(1);

        _cache.Set(cacheKey, cachedLogs, cacheOptions);

        _logger.LogDebug("Updated recent logs cache for {PodName} - Now contains {Count} entries",
            podName, cachedLogs.Count);
    }

    /// <summary>
    /// Clears all cache entries for a specific pod
    /// </summary>
    public void ClearPodCache(string podName)
    {
        _cache.Remove($"pod_exists:{podName}");
        _cache.Remove($"recent_logs:{podName}");
        _logger.LogDebug("Cleared all cache for {PodName}", podName);
    }

    /// <summary>
    /// Generates a hash for duplicate detection
    /// Uses timestamp + sequence number + first 100 chars of line
    /// </summary>
    private string GetLogHash(string line, DateTime timestamp, long sequenceNumber)
    {
        var content = line.Length > 100 ? line.Substring(0, 100) : line;
        var hashInput = $"{timestamp:O}|{sequenceNumber}|{content}";

        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var hashBytes = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(hashInput));
        return Convert.ToBase64String(hashBytes);
    }
}

/// <summary>
/// Lightweight cache entry for recent logs
/// </summary>
public class LogCacheEntry
{
    public string PodName { get; set; } = string.Empty;
    public DateTime TimeStamp { get; set; }
    public long SequenceNumber { get; set; }
    public string LineHash { get; set; } = string.Empty;
}
