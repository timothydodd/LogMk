namespace LogMkCommon;

public class DeploymentCount
{
    public required string Deployment { get; set; }
    public required string Pod { get; set; }
    public required long Count { get; set; }
}
