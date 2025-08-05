using System.ComponentModel.DataAnnotations;

namespace LogMkCommon;

public class SingleLogEntry
{
    [Required(ErrorMessage = "Pod name is required")]
    [StringLength(200, MinimumLength = 1, ErrorMessage = "Pod name must be between 1 and 200 characters")]
    [RegularExpression(@"^[a-zA-Z0-9\-._]+$", ErrorMessage = "Pod name can only contain letters, numbers, hyphens, periods, and underscores")]
    public required string Pod { get; set; }
    
    [Required(ErrorMessage = "Deployment name is required")]
    [StringLength(200, MinimumLength = 1, ErrorMessage = "Deployment name must be between 1 and 200 characters")]
    [RegularExpression(@"^[a-zA-Z0-9\-._]+$", ErrorMessage = "Deployment name can only contain letters, numbers, hyphens, periods, and underscores")]
    public required string Deployment { get; set; }
    
    [Required(ErrorMessage = "Log line content is required")]
    [StringLength(10000, ErrorMessage = "Log line cannot exceed 10000 characters")]
    public required string Line { get; set; }
    
    public DateTimeOffset? Timestamp { get; set; }
    
    public LogLevel? LogLevel { get; set; }
}