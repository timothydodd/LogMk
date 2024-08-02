namespace LogMkCommon;

public class LogLine
{
    public required string DeploymentName { get; set; }
    public required string PodName { get; set; }
    public required string Line { get; set; }
    public required LogLevel LogLevel { get; set; }
    public required DateTimeOffset TimeStamp { get; set; }
}
public enum LogLevel
{
    Any = 0,
    Trace = 1,
    Debug = 2,
    Information = 3,
    Warning = 4,
    Error = 5

}
