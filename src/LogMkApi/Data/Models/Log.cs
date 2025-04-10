using ServiceStack.DataAnnotations;

namespace LogMkApi.Data.Models;

[CompositeIndex(nameof(LogDate), nameof(Id))]
[CompositeIndex(nameof(LogDate), nameof(LogHour), nameof(Id))]
[CompositeIndex(nameof(LogDate), nameof(LogLevel))]
[CompositeIndex(nameof(LogDate), nameof(LogHour), nameof(LogLevel))]
[CompositeIndex(nameof(Deployment), nameof(Pod), nameof(TimeStamp))]
public class Log
{
    [PrimaryKey]
    [AutoIncrement]
    public int Id { get; set; }
    [Index]
    public required string Deployment { get; set; }
    [Index]
    public required string Pod { get; set; }
    [CustomField("TEXT")]
    public required string Line { get; set; }
    [Index]
    public required string LogLevel { get; set; }
    [Index]
    public required DateTime TimeStamp { get; set; }
    [Index]
    public required DateTime LogDate { get; set; }

    [Index]
    public required int LogHour { get; set; }

}


