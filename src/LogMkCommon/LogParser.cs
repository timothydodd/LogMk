﻿using System.Globalization;
using System.Text.Json;
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

        // Check if line contains JSON and try to parse timestamp from it
        if (line.TrimStart().StartsWith('{') && line.TrimEnd().EndsWith('}'))
        {
            var jsonTimestamp = ParseJsonTimestamp(line);
            if (jsonTimestamp.HasValue)
                return jsonTimestamp;
        }

        // First try to parse container log format timestamp (at the beginning)
        var firstSpace = line.IndexOf(' ');
        if (firstSpace > 0)
        {
            var timestampStr = line.Substring(0, firstSpace);
            // Skip malformed or partial timestamps (like "696426698Z")
            if (timestampStr.Length >= 20 && timestampStr.Contains("T"))
            {
                var containerTimestamp = ParseContainerTimestamp(timestampStr);
                if (containerTimestamp.HasValue)
                    return containerTimestamp;
            }
        }

        // Try common timestamp patterns anywhere in the line
        var patterns = new[]
        {
            @"\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]", // [2025-09-03 22:44:07] format
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
            return LogLevel.Any;

        // Remove ANSI escape sequences first
        var cleanLine = RemoveANSIEscapeRegex.Replace(line, string.Empty);

        // Parse container format to get actual log content
        var processedLine = ParseContainerLogFormat(line, cleanLine);

        return GetLogLevel(processedLine);
    }

    // Compiled regex patterns for efficient log level detection
    private static readonly Regex ErrorPattern = new(@"\b(ERROR|ERR|FAIL)\b|ERROR:|FAIL:|\[ERROR\]", 
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex WarningPattern = new(@"\b(WARN|WARNING|WRN)\b|WARN:|WARNING:|\[WARN\]|\[WARNING\]", 
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex InfoPattern = new(@"\b(INFO|INFORMATION|INF)\b|INFO:|INFORMATION:|\[INFO\]|\[INFORMATION\]", 
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex DebugPattern = new(@"\b(DEBUG|DBG|DBUG)\b|DEBUG:|DBUG:|\[DEBUG\]", 
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex TracePattern = new(@"\b(TRACE|TRC)\b|TRACE:|\[TRACE\]", 
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static LogLevel GetLogLevel(string logLine)
    {
        if (string.IsNullOrEmpty(logLine))
            return LogLevel.Any;

        // Quick check for JSON (avoid trim operations unless needed)
        int firstNonWhitespace = 0;
        while (firstNonWhitespace < logLine.Length && char.IsWhiteSpace(logLine[firstNonWhitespace]))
            firstNonWhitespace++;
        
        if (firstNonWhitespace < logLine.Length && logLine[firstNonWhitespace] == '{')
        {
            int lastNonWhitespace = logLine.Length - 1;
            while (lastNonWhitespace >= 0 && char.IsWhiteSpace(logLine[lastNonWhitespace]))
                lastNonWhitespace--;
            
            if (lastNonWhitespace >= 0 && logLine[lastNonWhitespace] == '}')
            {
                var jsonLevel = ParseJsonLogLevel(logLine);
                if (jsonLevel != LogLevel.Any)
                    return jsonLevel;
            }
        }

        // Use compiled regex patterns for efficient matching
        // Check in order of frequency (errors and warnings are typically less common)
        if (InfoPattern.IsMatch(logLine))
            return LogLevel.Information;
        if (ErrorPattern.IsMatch(logLine))
            return LogLevel.Error;
        if (WarningPattern.IsMatch(logLine))
            return LogLevel.Warning;
        if (DebugPattern.IsMatch(logLine))
            return LogLevel.Debug;
        if (TracePattern.IsMatch(logLine))
            return LogLevel.Trace;

        return LogLevel.Any; // Default when no specific level detected
    }

    public static string ParseContainerLogFormat(string originalLine, string cleanLine)
    {
        // Container log format: "timestamp stdout/stderr F/P actual-log-message"
        // F = full line, P = partial line
        var firstSpace = originalLine.IndexOf(' ');
        if (firstSpace <= 0)
            return cleanLine;

        var secondSpace = originalLine.IndexOf(' ', firstSpace + 1);
        if (secondSpace <= 0)
            return cleanLine;

        var outType = originalLine.Substring(firstSpace + 1, secondSpace - firstSpace - 1);
        if (outType == "stdout" || outType == "stderr")
        {
            // Check for the F/P flag after stdout/stderr
            var thirdSpace = originalLine.IndexOf(' ', secondSpace + 1);
            if (thirdSpace <= 0)
                return cleanLine;
            
            var flag = originalLine.Substring(secondSpace + 1, thirdSpace - secondSpace - 1);
            if (flag == "F" || flag == "P")
            {
                // Find the actual log message after the flag
                var fourthSpace = originalLine.IndexOf(' ', thirdSpace + 1);
                if (fourthSpace > 0)
                {
                    // We need to find this position in the clean line
                    // Count how many characters we need to skip in the clean line
                    var prefixToSkip = originalLine.Substring(0, fourthSpace + 1);
                    var cleanPrefixToSkip = RemoveANSIEscapeRegex.Replace(prefixToSkip, string.Empty);
                    
                    if (cleanPrefixToSkip.Length < cleanLine.Length)
                    {
                        return cleanLine.Substring(cleanPrefixToSkip.Length);
                    }
                }
            }
            else
            {
                // Old format without F/P flag
                var actualMessageStart = thirdSpace + 1;
                // Calculate how many chars to skip in clean line
                var prefixToSkip = originalLine.Substring(0, actualMessageStart);
                var cleanPrefixToSkip = RemoveANSIEscapeRegex.Replace(prefixToSkip, string.Empty);
                
                if (cleanPrefixToSkip.Length < cleanLine.Length)
                {
                    return cleanLine.Substring(cleanPrefixToSkip.Length);
                }
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

    private static DateTimeOffset? ParseJsonTimestamp(string line)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            
            // Try common timestamp field names
            string[] timestampFields = { "ts", "timestamp", "time", "@timestamp", "datetime", "date" };
            
            foreach (var field in timestampFields)
            {
                if (root.TryGetProperty(field, out var tsElement))
                {
                    var tsValue = tsElement.GetString();
                    if (!string.IsNullOrEmpty(tsValue))
                    {
                        if (DateTimeOffset.TryParse(tsValue, out var timestamp))
                            return timestamp;
                    }
                }
            }
            
            // Try parsing numeric timestamp (Unix epoch)
            if (root.TryGetProperty("timestamp", out var unixElement))
            {
                if (unixElement.ValueKind == JsonValueKind.Number)
                {
                    var unixTime = unixElement.GetInt64();
                    return DateTimeOffset.FromUnixTimeSeconds(unixTime);
                }
            }
        }
        catch
        {
            // Not valid JSON or parsing error, ignore
        }
        
        return null;
    }

    private static LogLevel ParseJsonLogLevel(string line)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            
            // Try common log level field names
            string[] levelFields = { "level", "severity", "log_level", "logLevel", "@level" };
            
            foreach (var field in levelFields)
            {
                if (root.TryGetProperty(field, out var levelElement))
                {
                    var levelValue = levelElement.GetString()?.ToUpperInvariant();
                    if (!string.IsNullOrEmpty(levelValue))
                    {
                        return levelValue switch
                        {
                            "ERROR" or "ERR" or "FATAL" or "CRITICAL" => LogLevel.Error,
                            "WARN" or "WARNING" => LogLevel.Warning,
                            "INFO" or "INFORMATION" => LogLevel.Information,
                            "DEBUG" or "DBG" => LogLevel.Debug,
                            "TRACE" or "TRC" or "VERBOSE" => LogLevel.Trace,
                            _ => LogLevel.Any
                        };
                    }
                }
            }
        }
        catch
        {
            // Not valid JSON or parsing error, ignore
        }
        
        return LogLevel.Any;
    }
}
