using System.Text.Json.Serialization;
using LogMkCommon;

namespace LogMkApi.Data;

[JsonSerializable(typeof(IEnumerable<LatestDeploymentEntry>))]
[JsonSerializable(typeof(List<LogLine>))]
public partial class ApiJsonSerializerContext : JsonSerializerContext
{
}
