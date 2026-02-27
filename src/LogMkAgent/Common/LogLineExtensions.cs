using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using LogMkCommon;

namespace LogMkAgent.Common;
public static class LogLineExtensions
{
    // Thread-safe sequence counters per pod
    private static readonly ConcurrentDictionary<string, long> PodSequenceCounters = new();

    // Track last activity time per pod key for cleanup
    private static readonly ConcurrentDictionary<string, DateTime> PodLastSeen = new();

    public static void AssignSequenceNumber(this LogLine logLine)
    {
        var podKey = $"{logLine.DeploymentName}:{logLine.PodName}";
        logLine.SequenceNumber = PodSequenceCounters.AddOrUpdate(podKey, 1, (key, current) => current + 1);
        PodLastSeen[podKey] = DateTime.UtcNow;
    }

    // Alternative method that returns the sequence number
    public static long GetNextSequenceNumber(string deploymentName, string podName)
    {
        var podKey = $"{deploymentName}:{podName}";
        PodLastSeen[podKey] = DateTime.UtcNow;
        return PodSequenceCounters.AddOrUpdate(podKey, 1, (key, current) => current + 1);
    }

    // Method to initialize sequence numbers from persisted state (optional)
    public static void InitializeSequenceNumber(string deploymentName, string podName, long lastKnownSequence)
    {
        var podKey = $"{deploymentName}:{podName}";
        PodSequenceCounters.TryAdd(podKey, lastKnownSequence);
    }

    // Method to reset sequence for a pod (useful for pod restarts)
    public static void ResetSequenceNumber(string deploymentName, string podName)
    {
        var podKey = $"{deploymentName}:{podName}";
        PodSequenceCounters.TryRemove(podKey, out _);
        PodLastSeen.TryRemove(podKey, out _);
    }

    // Get current sequence without incrementing
    public static long GetCurrentSequenceNumber(string deploymentName, string podName)
    {
        var podKey = $"{deploymentName}:{podName}";
        return PodSequenceCounters.TryGetValue(podKey, out var current) ? current : 0;
    }

    /// <summary>
    /// Removes sequence counter entries for pods not seen within the given timespan.
    /// Call periodically to prevent unbounded dictionary growth.
    /// </summary>
    public static int CleanupStaleEntries(TimeSpan maxAge)
    {
        var cutoff = DateTime.UtcNow - maxAge;
        var removed = 0;

        foreach (var kvp in PodLastSeen)
        {
            if (kvp.Value < cutoff)
            {
                if (PodLastSeen.TryRemove(kvp.Key, out _))
                {
                    PodSequenceCounters.TryRemove(kvp.Key, out _);
                    removed++;
                }
            }
        }

        return removed;
    }

    public static int TrackedPodCount => PodSequenceCounters.Count;

    /// <summary>
    /// Computes a content-based SHA256 fingerprint of the log line content.
    /// Truncated to 16 hex characters for compactness.
    /// </summary>
    public static void AssignFingerprint(this LogLine logLine)
    {
        if (string.IsNullOrEmpty(logLine.Line))
        {
            logLine.Fingerprint = string.Empty;
            return;
        }

        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(logLine.Line));
        logLine.Fingerprint = Convert.ToHexString(hashBytes, 0, 8).ToLowerInvariant();
    }
}
