import { Pipe, PipeTransform } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";

@Pipe({ name: 'highlightLog' })
export class HighlightLogPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string, searchTerm?: string): SafeHtml {
    if (!value) return value;

    // Escape any existing HTML to prevent injection
    value = this.escapeHtml(value);

    // Apply syntax highlighting patterns
    const replacements: [RegExp, string][] = [

  // HTTP Methods - do this early to avoid conflicts
  [/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE)\b/gi, '<span class="http-method">$&</span>'],

  // HTTP Status Codes - only match 3-digit codes that aren't part of time formats
  [/(?<![:\d])(200|201|202|204|206)\b/g, '<span class="http-success">$&</span>'],
  [/(?<![:\d])(301|302|303|304|307|308)\b/g, '<span class="http-redirect">$&</span>'],
  [/(?<![:\d])(400|401|403|404|405|409|410|422|429)\b/g, '<span class="http-client-error">$&</span>'],
  [/(?<![:\d])(500|501|502|503|504|505)\b/g, '<span class="http-server-error">$&</span>'],

  // URLs (http, https, ftp) - must be complete URLs with domain
  [/(https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9._]*[a-zA-Z0-9](?::[0-9]+)?(?:\/[^\s<>"'{},|\\^`\[\]]*)?)/g, '<span class="url">$1</span>'],

  // IP Addresses (IPv4)
  [/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '<span class="ip-address">$&</span>'],

  // Key-value pairs - more specific patterns to avoid conflicts
  [/\b(DeviceId|Value|QueueSize|Temperature|Humidity|Status|Count|Total|Size|Length|Width|Height|Speed|Rate|Level|Threshold|Timeout|Delay|Interval|Duration|Timestamp|Id|Name|Type|State|Mode|Version|Index|Offset|Limit|Max|Min|Average|Sum)=(\d+(?:\.\d+)?)\b/gi, '<span class="kv-key">$1</span>=<span class="kv-number">$2</span>'],

  // .NET Namespaces and Services (e.g., LogSummaryService.LogSummaryHourlyBackgroundService[0])
  [/\b([A-Z][a-zA-Z0-9]*(?:\.[A-Z][a-zA-Z0-9]*)+)(\[[0-9]+\])?/g, '<span class="dotnet-namespace">$1</span>$2'],

  // JSON keys (quoted strings followed by colon)
  [/"([^"]+)"\s*:/g, '"<span class="json-key">$1</span>":'],

  // JSON string values (quoted strings not followed by colon)
  [/:\s*"([^"]*)"/g, ': "<span class="json-string">$1</span>"'],

  // JSON numbers
  [/:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, ': <span class="json-number">$1</span>'],

  // JSON booleans
  [/:\s*(true|false)\b/g, ': <span class="json-boolean">$1</span>'],

  // JSON null
  [/:\s*(null)\b/g, ': <span class="json-null">$1</span>'],

  // Stack trace class names (only match when followed by method call or line number)
  [/\b([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)(?=\.[a-zA-Z_$][a-zA-Z0-9_$]*\(|:\d+)/g, '<span class="stack-class">$1</span>'],

  // Stack trace method calls
  [/\.([a-zA-Z_$][a-zA-Z0-9_$]*)\(/g, '.<span class="stack-method">$1</span>('],

  // Line numbers in stack traces
  [/:(\d+)\)/g, ':<span class="stack-line">$1</span>)'],

  // Log levels with color coding
  [/\b(ERROR|FATAL|CRITICAL)\b/gi, '<span class="log-level-error">$&</span>'],
  [/\b(WARN|WARNING)\b/gi, '<span class="log-level-warn">$&</span>'],
  [/\b(INFO|INFORMATION)\b/gi, '<span class="log-level-info">$&</span>'],
  [/\b(DEBUG|TRACE|VERBOSE)\b/gi, '<span class="log-level-debug">$&</span>'],

  // SQL keywords
  [/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|ORDER|GROUP|BY|HAVING|UNION|CREATE|DROP|ALTER|TABLE|INDEX|DATABASE)\b/gi, '<span class="sql-keyword">$&</span>'],

  // Exception types
  [/\b([A-Z][a-zA-Z]*Exception|[A-Z][a-zA-Z]*Error)\b/g, '<span class="exception-type">$&</span>'],

  // Email addresses
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '<span class="email">$&</span>'],

  // UUIDs
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<span class="uuid">$&</span>'],

  // Timestamps (ISO format)
  [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})?/g, '<span class="timestamp">$&</span>'],
];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }

    // Apply search term highlighting AFTER other patterns
    if (searchTerm && searchTerm.trim()) {
      const searchRegex = new RegExp(`(${this.escapeRegExp(searchTerm.trim())})`, 'gi');
      value = value.replace(searchRegex, '<span class="search-highlight">$1</span>');
    }

    return this.sanitizer.bypassSecurityTrustHtml(value);
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

@Pipe({ name: 'LogLevelPipe' })
export class LogLevelPipe implements PipeTransform {


  transform(value: string): string {
    if (!value) return 'UNKNOWN';

    const lower = value.toLowerCase();

    if (/fatal/.test(lower)) return 'FATAL';
    if (/error|fail/.test(lower)) return 'ERROR';
    if (/warn/.test(lower)) return 'WARN';
    if (/info/.test(lower)) return 'INFO';
    if (/debug/.test(lower)) return 'DEBUG';
    if (/trace/.test(lower)) return 'TRACE';

    return 'UNKNOWN';
  }
}