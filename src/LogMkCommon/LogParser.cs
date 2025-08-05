using System.Globalization;
using System.Text.RegularExpressions;

namespace LogMkCommon;

public static class LogParser
{
    private static readonly string RemoveANSIEscapePattern = @"\x1B\[[0-9;]*[A-Za-z]";
    private static readonly Regex RemoveANSIEscapeRegex = new(RemoveANSIEscapePattern, RegexOptions.Compiled);

    public static DateTimeOffset? ParseTimestamp(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
            return null;

        // First try to parse container log format timestamp (at the beginning)
        var firstSpace = line.IndexOf(' ');
        if (firstSpace > 0)
        {
            var timestampStr = line.Substring(0, firstSpace);
            var containerTimestamp = ParseContainerTimestamp(timestampStr);
            if (containerTimestamp.HasValue)
                return containerTimestamp;
        }

        // Try common timestamp patterns anywhere in the line
        var patterns = new[]
        {
            @"(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)", // ISO 8601
            @"(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})", // 2024/01/15 12:34:56
            @"(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2})", // 01/15/2024 12:34:56
            @"(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})", // Jan 15 12:34:56
            @"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})" // 2024-01-15 12:34:56
        };

        foreach (var pattern in patterns)
        {
            var match = Regex.Match(line, pattern);
            if (match.Success)
            {
                if (DateTimeOffset.TryParse(match.Groups[1].Value, out var timestamp))
                {
                    return timestamp;
                }
            }
        }

        return null;
    }

    public static LogLevel ParseLogLevel(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
            return LogLevel.Information;

        // Remove ANSI escape sequences first
        var cleanLine = RemoveANSIEscapeRegex.Replace(line, string.Empty);
        
        // Parse container format to get actual log content
        var processedLine = ParseContainerLogFormat(line, cleanLine);
        
        return GetLogLevel(processedLine);
    }

    private static LogLevel GetLogLevel(string logLine)
    {
        if (string.IsNullOrEmpty(logLine))
            return LogLevel.Information;

        var upperLine = logLine.ToUpperInvariant();

        // Check for common log level patterns with boundaries
        if (ContainsLogLevel(upperLine, "[ERROR]", "ERROR:", " ERR ", "ERROR "))
            return LogLevel.Error;
        if (ContainsLogLevel(upperLine, "[WARN]", "[WARNING]", "WARNING:", " WARN ", " WRN "))
            return LogLevel.Warning;
        if (ContainsLogLevel(upperLine, "[INFO]", "[INFORMATION]", "INFORMATION:", " INFO ", " INF "))
            return LogLevel.Information;
        if (ContainsLogLevel(upperLine, "[DEBUG]", "DEBUG:", " DBG ", " DEBUG "))
            return LogLevel.Debug;
        if (ContainsLogLevel(upperLine, "[TRACE]", "TRACE:", " TRC ", " TRACE "))
            return LogLevel.Trace;

        // Check for log level at the beginning of the line
        if (upperLine.StartsWith("ERROR") || upperLine.StartsWith("ERR"))
            return LogLevel.Error;
        if (upperLine.StartsWith("WARN") || upperLine.StartsWith("WARNING"))
            return LogLevel.Warning;
        if (upperLine.StartsWith("INFO") || upperLine.StartsWith("INFORMATION"))
            return LogLevel.Information;
        if (upperLine.StartsWith("DEBUG") || upperLine.StartsWith("DBG"))
            return LogLevel.Debug;
        if (upperLine.StartsWith("TRACE") || upperLine.StartsWith("TRC"))
            return LogLevel.Trace;

        return LogLevel.Information; // Default
    }

    private static bool ContainsLogLevel(string upperLine, params string[] patterns)
    {
        return patterns.Any(pattern => upperLine.Contains(pattern));
    }

    public static string ParseContainerLogFormat(string originalLine, string cleanLine)
    {
        // Container log format: "timestamp stdout/stderr actual-log-message"
        var firstSpace = originalLine.IndexOf(' ');
        if (firstSpace <= 0)
            return cleanLine;

        var secondSpace = originalLine.IndexOf(' ', firstSpace + 1);
        if (secondSpace <= 0)
            return cleanLine;

        var thirdSpace = originalLine.IndexOf(' ', secondSpace + 1);
        if (thirdSpace <= 0)
            return cleanLine;

        var outType = originalLine.Substring(firstSpace + 1, secondSpace - firstSpace - 1);
        if (outType == "stdout" || outType == "stderr")
        {
            // Calculate the position adjustment due to ANSI escape sequences removal
            var lengthDiff = originalLine.Length - cleanLine.Length;
            var adjustedPosition = thirdSpace + 1 - lengthDiff;
            
            if (adjustedPosition >= 0 && adjustedPosition < cleanLine.Length)
            {
                return cleanLine.Substring(adjustedPosition);
            }
        }

        return cleanLine;
    }

    private static DateTimeOffset? ParseContainerTimestamp(string timestampStr)
    {
        try
        {
            // Truncate fractional seconds if necessary
            timestampStr = TruncateFractionalSeconds(timestampStr, 7);

            if (DateTimeOffset.TryParseExact(timestampStr, "yyyy-MM-ddTHH:mm:ss.fffffffZ",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var timestamp))
            {
                return timestamp;
            }
        }
        catch
        {
            // Ignore parsing errors
        }

        return null;
    }

    private static string TruncateFractionalSeconds(string timestamp, int maxFractionalDigits)
    {
        var dotIndex = timestamp.IndexOf('.');
        if (dotIndex == -1)
            return timestamp;

        var endIndex = dotIndex + maxFractionalDigits + 1;
        if (endIndex >= timestamp.Length - 1)
            return timestamp;

        return timestamp.Substring(0, endIndex) + "Z";
    }

    public static string RemoveANSIEscapeSequences(string line)
    {
        return RemoveANSIEscapeRegex.Replace(line, string.Empty);
    }
}