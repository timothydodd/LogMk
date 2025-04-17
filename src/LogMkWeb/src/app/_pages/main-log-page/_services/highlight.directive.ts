import { Pipe, PipeTransform } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";

@Pipe({ name: 'highlightLog' })
export class HighlightLogPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) return value;

const replacements: [RegExp, string][] = [
  // HTTP Methods (surrounded by quotes or whitespace)
  [/(?<=[\s"'])\b(GET|POST|PUT|DELETE|PATCH)\b(?=[\s"'.,;:?!])/g, `<span class="http-method">$1</span>`],

  // Success Codes (200, 201, 204)
  [/(?<=[\s"'])\b(200|201|204)\b(?=[\s"'.,;:?!])/g, `<span class="http-success">$1</span>`],

  // Client Error Codes (400–404)
  [/(?<=[\s"'])\b(400|401|403|404|301|204|302)\b(?=[\s"'.,;:?!])/g, `<span class="http-client-error">$1</span>`],

  // Server Error Codes (500, 503)
  [/(?<=[\s"'])\b(500|503)\b(?=[\s"'.,;:?!])/g, `<span class="http-server-error">$1</span>`],
];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }

    return this.sanitizer.bypassSecurityTrustHtml(value);
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