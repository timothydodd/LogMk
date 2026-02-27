using LogMkApi.Data;
using Microsoft.Extensions.Caching.Memory;
using System.Collections.Concurrent;

namespace LogMkApi.Services;

/// <summary>
/// Caches pod metadata and provides fingerprint-based duplicate detection
/// </summary>
public class LogCacheService : IDisposable
{
    private readonly IMemoryCache _cache;
    private readonly LogRepo _logRepo;
    private readonly ILogger<LogCacheService> _logger;
    private readonly int _deduplicationWindowSeconds;

    // Cache configuration
    private readonly int _podExistenceCacheDurationMinutes;

    // Fingerprint-based dedup: key = "{podName}:{fingerprint}", value = when last seen
    private readonly ConcurrentDictionary<string, DateTimeOffset> _fingerprintCache = new();
    private readonly Timer _cleanupTimer;

    public LogCacheService(IMemoryCache cache, LogRepo logRepo, ILogger<LogCacheService> logger, IConfiguration configuration)
    {
        _cache = cache;
        _logRepo = logRepo;
        _logger = logger;

        // Read deduplication window from configuration
        _deduplicationWindowSeconds = 30;
        if (configuration != null && int.TryParse(configuration["LogSettings:FingerprintDeduplicationWindowSeconds"], out var dedupWindow))
        {
            _deduplicationWindowSeconds = dedupWindow;
        }

        _podExistenceCacheDurationMinutes = 60;
        if (configuration != null && int.TryParse(configuration["LogSettings:PodCacheTtlMinutes"], out var podCacheTtl))
        {
            _podExistenceCacheDurationMinutes = podCacheTtl;
        }

        // Periodic cleanup of expired fingerprints every 60 seconds
        _cleanupTimer = new Timer(_ => CleanupExpiredFingerprints(), null, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(60));

        _logger.LogInformation("LogCacheService initialized - Dedup window: {Seconds} seconds", _deduplicationWindowSeconds);
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

        exists = await _logRepo.PodExistsAsync(podName);

        var cacheOptions = new MemoryCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(_podExistenceCacheDurationMinutes));

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
    /// Checks if a log is a duplicate based on pod name + fingerprint within the dedup window.
    /// If not a duplicate, records the fingerprint. Returns true if duplicate.
    /// </summary>
    public bool IsDuplicateFingerprint(string podName, string fingerprint)
    {
        if (string.IsNullOrEmpty(fingerprint))
            return false;

        var key = $"{podName}:{fingerprint}";
        var now = DateTimeOffset.UtcNow;
        var windowCutoff = now.AddSeconds(-_deduplicationWindowSeconds);

        if (_fingerprintCache.TryGetValue(key, out var lastSeen) && lastSeen > windowCutoff)
        {
            _logger.LogDebug("Duplicate fingerprint detected for {PodName} - Fingerprint: {Fingerprint}", podName, fingerprint);
            return true;
        }

        // Record this fingerprint
        _fingerprintCache[key] = now;
        return false;
    }

    /// <summary>
    /// Clears all cache entries for a specific pod
    /// </summary>
    public void ClearPodCache(string podName)
    {
        _cache.Remove($"pod_exists:{podName}");
        _logger.LogDebug("Cleared all cache for {PodName}", podName);
    }

    private void CleanupExpiredFingerprints()
    {
        var cutoff = DateTimeOffset.UtcNow.AddSeconds(-_deduplicationWindowSeconds);
        var removed = 0;

        foreach (var kvp in _fingerprintCache)
        {
            if (kvp.Value < cutoff)
            {
                if (_fingerprintCache.TryRemove(kvp.Key, out _))
                    removed++;
            }
        }

        if (removed > 0)
        {
            _logger.LogDebug("Cleaned up {Count} expired fingerprints, {Remaining} remaining",
                removed, _fingerprintCache.Count);
        }
    }

    public void Dispose()
    {
        _cleanupTimer?.Dispose();
    }
}
