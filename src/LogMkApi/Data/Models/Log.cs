using ServiceStack.DataAnnotations;

namespace LogMkApi.Data.Models;

public class Log
{
    [PrimaryKey]
    [AutoIncrement]
    public int Id { get; set; }
    [Index]
    public required string Deployment { get; set; }
    [Index]
    public required string Pod { get; set; }
    [StringLength(3000)]
    public required string Line { get; set; }
    public required string LogLevel { get; set; }
    public required DateTime TimeStamp { get; set; }
}

