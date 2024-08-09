using System.Text.Json.Serialization;
using LogMkCommon;

namespace LogMkAgent;

[JsonSerializable(typeof(List<LatestDeploymentEntry>))]
[JsonSerializable(typeof(List<LogLine>))]
[JsonSerializable(typeof(IEnumerable<LatestDeploymentEntry>))]
[JsonSerializable(typeof(IEnumerable<LogLine>))]
public partial class ApiJsonSerializerContext : JsonSerializerContext
{
}
