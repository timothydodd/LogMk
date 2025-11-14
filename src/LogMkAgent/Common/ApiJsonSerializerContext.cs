using System.Text.Json.Serialization;
using LogMkCommon;

namespace LogMkAgent;

[JsonSerializable(typeof(List<LatestDeploymentEntry>))]
[JsonSerializable(typeof(List<LogLine>))]
[JsonSerializable(typeof(List<DeploymentCount>))]
[JsonSerializable(typeof(IEnumerable<LatestDeploymentEntry>))]
[JsonSerializable(typeof(IEnumerable<LogLine>))]
[JsonSerializable(typeof(ValidationSettings))]
public partial class ApiJsonSerializerContext : JsonSerializerContext
{
}
