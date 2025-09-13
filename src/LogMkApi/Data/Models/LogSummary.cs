using RoboDodd.OrmLite;
using System.ComponentModel.DataAnnotations;

namespace LogMkApi.Data.Models;


[CompositeIndex(nameof(LogDate), nameof(LogLevel))]
[CompositeIndex(nameof(LogDate), nameof(Deployment))]
[CompositeIndex(nameof(LogDate), nameof(Pod))]
[CompositeIndex(nameof(LogDate), nameof(Deployment), nameof(LogLevel))]
[CompositeIndex(nameof(LogDate), nameof(Pod), nameof(LogLevel))]
public class LogSummary
{
    [PrimaryKey]
    [AutoIncrement]
    public int Id { get; set; }

    [Index]
    public required string Deployment { get; set; }

    [Index]
    public required string Pod { get; set; }

    [Index]
    public required string LogLevel { get; set; }

    [Index]
    public required DateTime LogDate { get; set; }

    public required int Count { get; set; }

    public required DateTime LastUpdated { get; set; }
}

[CompositeIndex(nameof(LogDate), nameof(LogLevel))]
[CompositeIndex(nameof(LogDate), nameof(Deployment))]
[CompositeIndex(nameof(LogDate), nameof(Pod))]
[CompositeIndex(nameof(LogDate), nameof(Deployment), nameof(LogLevel))]
[CompositeIndex(nameof(LogDate), nameof(Pod), nameof(LogLevel))]
public class LogSummaryHour
{
    [PrimaryKey]
    [AutoIncrement]
    public int Id { get; set; }

    [Index]
    public required string Deployment { get; set; }

    [Index]
    public required string Pod { get; set; }

    [Index]
    public required string LogLevel { get; set; }

    [Index]
    public required DateTime LogDate { get; set; }
    [Index]
    public required int LogHour { get; set; }
    public required int Count { get; set; }
    public required DateTime LastUpdated { get; set; }

}
