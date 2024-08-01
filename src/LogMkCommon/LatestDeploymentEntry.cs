namespace LogMkCommon;
public class LatestDeploymentEntry
{
    public required string Deployment { get; set; }
    public required string Pod { get; set; }
    public DateTimeOffset TimeStamp { get; set; }
}
