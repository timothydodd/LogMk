import { Pipe, PipeTransform } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";

@Pipe({ name: 'highlightLog' })
export class HighlightLogPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string, searchTerm?: string): SafeHtml {
    if (!value) return value;

    // First, highlight search terms if provided
    if (searchTerm && searchTerm.trim()) {
      const searchRegex = new RegExp(`(${this.escapeRegExp(searchTerm.trim())})`, 'gi');
      value = value.replace(searchRegex, '<span class="search-highlight">$1</span>');
    }

const replacements: [RegExp, string][] = [
  // URLs (http, https, ftp)
  [/(https?:\/\/[^\s<>"'{},|\\^`\[\]]+)/g, '<span class="url">$1</span>'],

  // IP Addresses (IPv4)
  [/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '<span class="ip-address">$&</span>'],

  // File paths (absolute and relative)
  [/([/\\]?[a-zA-Z0-9_.-]+[/\\])*[a-zA-Z0-9_.-]*\.[a-zA-Z]{2,4}/g, '<span class="file-path">$&</span>'],

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

  // Stack trace class names
  [/\b([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)\b/g, '<span class="stack-class">$1</span>'],

  // Stack trace method calls
  [/\.([a-zA-Z_$][a-zA-Z0-9_$]*)\(/g, '.<span class="stack-method">$1</span>('],

  // Line numbers in stack traces
  [/:(\d+)\)/g, ':<span class="stack-line">$1</span>)'],

  // HTTP Methods
  [/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE)\b/gi, '<span class="http-method">$&</span>'],

  // HTTP Success Codes (2xx)
  [/\b(200|201|202|204|206)\b/g, '<span class="http-success">$&</span>'],

  // HTTP Client Error Codes (4xx)
  [/\b(400|401|403|404|405|409|410|422|429)\b/g, '<span class="http-client-error">$&</span>'],

  // HTTP Server Error Codes (5xx)
  [/\b(500|501|502|503|504|505)\b/g, '<span class="http-server-error">$&</span>'],

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

    return this.sanitizer.bypassSecurityTrustHtml(value);
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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