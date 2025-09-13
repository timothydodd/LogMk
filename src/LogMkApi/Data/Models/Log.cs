using System.ComponentModel.DataAnnotations;
using RoboDodd.OrmLite;

namespace LogMkApi.Data.Models;

[CompositeIndex(nameof(LogDate), nameof(Id))]
[CompositeIndex(nameof(LogDate), nameof(LogHour), nameof(Id))]
[CompositeIndex(nameof(LogDate), nameof(LogLevel))]
[CompositeIndex(nameof(LogDate), nameof(LogHour), nameof(LogLevel))]
[CompositeIndex(nameof(Deployment), nameof(Pod), nameof(TimeStamp))]
[CompositeIndex(nameof(BatchId), nameof(ReceivedAt))]                     // Batch tracking
[CompositeIndex(nameof(TimeStamp), nameof(LogLevel))]
[CompositeIndex(nameof(Deployment), nameof(Pod), nameof(SequenceNumber))] // Recent errors/warnings
public class Log
{
    [PrimaryKey]
    [AutoIncrement]
    public long Id { get; set; }
    [Index]
    [MaxLength(100)]
    public required string Deployment { get; set; }
    [Index]
    [MaxLength(100)]
    public required string Pod { get; set; }
    [CustomField("TEXT")]
    public required string Line { get; set; }
    [Index]
    [MaxLength(20)]
    public required string LogLevel { get; set; }
    [Index]
    public required DateTime TimeStamp { get; set; }
    [Index]
    public required DateTime LogDate { get; set; }

    [Index]
    public required int LogHour { get; set; }
    [Index]
    public long SequenceNumber { get; set; } = 0;
    [MaxLength(50)]
    public string BatchId { get; set; } = string.Empty;
    public DateTime ReceivedAt { get; set; }
    // Computed property for pod key (useful for queries)
    [Ignore] // Don't store in database
    public string PodKey => $"{Deployment}:{Pod}";
}


