using System.Collections.Concurrent;
using LogMkCommon;

namespace LogMkAgent.Common;
public static class LogLineExtensions
{
    // Thread-safe sequence counters per pod
    private static readonly ConcurrentDictionary<string, long> PodSequenceCounters = new();

    public static void AssignSequenceNumber(this LogLine logLine)
    {
        var podKey = $"{logLine.DeploymentName}:{logLine.PodName}";
        logLine.SequenceNumber = PodSequenceCounters.AddOrUpdate(podKey, 1, (key, current) => current + 1);
    }

    // Alternative method that returns the sequence number
    public static long GetNextSequenceNumber(string deploymentName, string podName)
    {
        var podKey = $"{deploymentName}:{podName}";
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
    }

    // Get current sequence without incrementing
    public static long GetCurrentSequenceNumber(string deploymentName, string podName)
    {
        var podKey = $"{deploymentName}:{podName}";
        return PodSequenceCounters.TryGetValue(podKey, out var current) ? current : 0;
    }
}

// Up
