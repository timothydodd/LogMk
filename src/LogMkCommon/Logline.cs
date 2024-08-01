namespace LogMkCommon;

public class LogLine
{
    public required string DeploymentName { get; set; }
    public required string PodName { get; set; }
    public required string Line { get; set; }
    public required LogLevel LogLevel { get; set; }
    public required DateTime TimeStamp { get; set; }
}
public enum LogLevel
{
    ANY = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4

}
