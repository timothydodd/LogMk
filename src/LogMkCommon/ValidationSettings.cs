using System.ComponentModel.DataAnnotations;

namespace LogMkCommon;

public class ValidationSettings
{
    // Timestamp validation settings
    public int MaxDaysOld { get; set; } = 30; // For new pods (backfill scenario)
    public int MaxMinutesOldForExistingPods { get; set; } = 5; // For existing pods (real-time scenario)
    public int MaxFutureMinutes { get; set; } = 5;

    // Content validation settings
    public int MaxLineLength { get; set; } = 10000;
    public int MaxDeploymentNameLength { get; set; } = 100;
    public int MaxPodNameLength { get; set; } = 100;
    public string DeploymentNamePattern { get; set; } = @"^[a-zA-Z0-9\-._]+$";
    public string PodNamePattern { get; set; } = @"^[a-zA-Z0-9\-._]+$";

    // Log level validation
    public bool AllowEmptyLogLevel { get; set; } = false;

    // Batch validation
    public int MaxBatchSize { get; set; } = 1000;

    // Duplicate detection
    public bool EnableDuplicateDetection { get; set; } = true;

    // Metadata
    public string Version { get; set; } = "1.0";
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
}

public class LogLineValidator
{
    private readonly ValidationSettings _settings;

    public LogLineValidator(ValidationSettings settings)
    {
        _settings = settings;
    }

    public ValidationResult ValidateLogLine(LogLine logLine, int index = 0)
    {
        var errors = new List<string>();

        try
        {
            // Required field validations
            if (string.IsNullOrWhiteSpace(logLine?.DeploymentName))
                errors.Add("DeploymentName is required");

            if (string.IsNullOrWhiteSpace(logLine?.PodName))
                errors.Add("PodName is required");

            if (string.IsNullOrWhiteSpace(logLine?.Line))
                errors.Add("Line content is required");

            if (logLine?.SequenceNumber <= 0)
                errors.Add("SequenceNumber must be positive");

            if (logLine?.TimeStamp == default)
                errors.Add("TimeStamp is required");

            // Additional validations when logLine is not null
            if (logLine != null)
            {
                // Timestamp validations
                if (logLine.TimeStamp > DateTimeOffset.UtcNow.AddMinutes(_settings.MaxFutureMinutes))
                    errors.Add($"TimeStamp is too far in the future (>{_settings.MaxFutureMinutes} minutes)");

                if (logLine.TimeStamp < DateTimeOffset.UtcNow.AddDays(-_settings.MaxDaysOld))
                    errors.Add($"TimeStamp is too old (>{_settings.MaxDaysOld} days)");

                // Length validations
                if (logLine.Line?.Length > _settings.MaxLineLength)
                    errors.Add($"Line content too long (max {_settings.MaxLineLength} characters)");

                if (logLine.DeploymentName?.Length > _settings.MaxDeploymentNameLength)
                    errors.Add($"DeploymentName too long (max {_settings.MaxDeploymentNameLength} characters)");

                if (logLine.PodName?.Length > _settings.MaxPodNameLength)
                    errors.Add($"PodName too long (max {_settings.MaxPodNameLength} characters)");

                // Pattern validations
                if (!string.IsNullOrEmpty(logLine.DeploymentName) && 
                    !System.Text.RegularExpressions.Regex.IsMatch(logLine.DeploymentName, _settings.DeploymentNamePattern))
                    errors.Add("DeploymentName contains invalid characters");

                if (!string.IsNullOrEmpty(logLine.PodName) && 
                    !System.Text.RegularExpressions.Regex.IsMatch(logLine.PodName, _settings.PodNamePattern))
                    errors.Add("PodName contains invalid characters");

                // LogLevel validation
                if (!_settings.AllowEmptyLogLevel && !Enum.IsDefined(typeof(LogLevel), logLine.LogLevel))
                    errors.Add("Invalid log level");
            }
        }
        catch (Exception ex)
        {
            errors.Add($"Validation error: {ex.Message}");
        }

        return new ValidationResult
        {
            IsValid = !errors.Any(),
            Errors = errors.ToArray(),
            Index = index
        };
    }

    public BatchValidationResult ValidateBatch(IEnumerable<LogLine> logLines)
    {
        var logLinesList = logLines.ToList();
        var results = new List<ValidationResult>();
        var validLogs = new List<LogLine>();

        if (logLinesList.Count > _settings.MaxBatchSize)
        {
            return new BatchValidationResult
            {
                IsValid = false,
                ValidationResults = new List<ValidationResult>(),
                ValidLogs = new List<LogLine>(),
                TotalCount = logLinesList.Count,
                ValidCount = 0,
                InvalidCount = logLinesList.Count,
                BatchErrors = new[] { $"Batch size exceeds maximum ({_settings.MaxBatchSize})" }
            };
        }

        for (int i = 0; i < logLinesList.Count; i++)
        {
            var result = ValidateLogLine(logLinesList[i], i);
            results.Add(result);

            if (result.IsValid)
            {
                validLogs.Add(logLinesList[i]);
            }
        }

        return new BatchValidationResult
        {
            IsValid = validLogs.Count == logLinesList.Count,
            ValidationResults = results.Where(r => !r.IsValid).ToList(),
            ValidLogs = validLogs,
            TotalCount = logLinesList.Count,
            ValidCount = validLogs.Count,
            InvalidCount = logLinesList.Count - validLogs.Count,
            BatchErrors = new string[0]
        };
    }
}

public class ValidationResult
{
    public bool IsValid { get; set; }
    public string[] Errors { get; set; } = Array.Empty<string>();
    public int Index { get; set; }
}

public class BatchValidationResult
{
    public bool IsValid { get; set; }
    public List<ValidationResult> ValidationResults { get; set; } = new();
    public List<LogLine> ValidLogs { get; set; } = new();
    public int TotalCount { get; set; }
    public int ValidCount { get; set; }
    public int InvalidCount { get; set; }
    public string[] BatchErrors { get; set; } = Array.Empty<string>();
}