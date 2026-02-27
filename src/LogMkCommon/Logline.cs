using System.ComponentModel.DataAnnotations;

namespace LogMkCommon;

public class LogLine
{
    [Required(ErrorMessage = "Deployment name is required")]
    [StringLength(200, MinimumLength = 1, ErrorMessage = "Deployment name must be between 1 and 200 characters")]
    [RegularExpression(@"^[a-zA-Z0-9\-._]+$", ErrorMessage = "Deployment name can only contain letters, numbers, hyphens, periods, and underscores")]
    public required string DeploymentName { get; set; }
    
    [Required(ErrorMessage = "Pod name is required")]
    [StringLength(200, MinimumLength = 1, ErrorMessage = "Pod name must be between 1 and 200 characters")]
    [RegularExpression(@"^[a-zA-Z0-9\-._]+$", ErrorMessage = "Pod name can only contain letters, numbers, hyphens, periods, and underscores")]
    public required string PodName { get; set; }
    
    [Required(ErrorMessage = "Log line content is required")]
    [StringLength(10000, ErrorMessage = "Log line cannot exceed 10000 characters")]
    public required string Line { get; set; }
    
    [Required(ErrorMessage = "Log level is required")]
    [EnumDataType(typeof(LogLevel), ErrorMessage = "Invalid log level")]
    public required LogLevel LogLevel { get; set; }
    
    [Range(0, long.MaxValue, ErrorMessage = "Sequence number must be non-negative")]
    public long SequenceNumber { get; set; }

    [StringLength(16, ErrorMessage = "Fingerprint cannot exceed 16 characters")]
    public string Fingerprint { get; set; } = string.Empty;

    [Required(ErrorMessage = "Timestamp is required")]
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
