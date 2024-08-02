namespace LogMkCommon;
public class LatestDeploymentEntry
{
    public required string Deployment { get; set; }
    public required string Pod { get; set; }
    public DateTime TimeStamp { get; set; }
}
