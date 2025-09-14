import { Component, computed, inject, signal, TemplateRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastrService } from 'ngx-toastr';
import { Log } from '../../_services/signalr.service';
import { ModalService } from '../../_services/modal.service';
import { TimestampFormatPipe } from '../../_pipes/timestamp-format.pipe';
import { HighlightLogPipe } from '../../_pages/main-log-page/_services/highlight.directive';

@Component({
  selector: 'app-log-details-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TimestampFormatPipe, HighlightLogPipe],
  template: `
    <!-- Body Template -->
    <ng-template #bodyTemplate>
      <div class="log-details-content">
            @if (log(); as logData) {
              <div class="log-metadata">
                <div class="metadata-row">
                  <span class="label">Timestamp:</span>
                  <span class="value">{{ logData.timeStamp | timestampFormat }}</span>
                </div>
                <div class="metadata-row">
                  <span class="label">Pod:</span>
                  <span class="value pod-name" [style.color]="logData.podColor">{{ logData.pod }}</span>
                </div>
                <div class="metadata-row">
                  <span class="label">Level:</span>
                  <span class="value log-level" [class]="logData.logLevel.toLowerCase()">{{ logData.logLevel }}</span>
                </div>
                <div class="metadata-row">
                  <span class="label">Deployment:</span>
                  <span class="value">{{ logData.deployment }}</span>
                </div>
              </div>

              <div class="log-content-section">
                <div class="section-header">
                  <h4>Full Log Message</h4>
                  <button class="copy-btn" (click)="copyFullLog()" title="Copy full log">
                    @if (copied()) {
                      <lucide-icon name="check" size="16"></lucide-icon>
                      Copied!
                    } @else {
                      <lucide-icon name="copy" size="16"></lucide-icon>
                      Copy
                    }
                  </button>
                </div>

                <div class="log-content">
                  @if (isJsonContent()) {
                    <pre class="json-content" [innerHTML]="formattedJson() | highlightLog"></pre>
                  } @else {
                    <pre class="text-content" [innerHTML]="logData.line | highlightLog"></pre>
                  }
                </div>
              </div>
            }
      </div>
    </ng-template>

    <!-- Footer Template -->
    <ng-template #footerTemplate>
      <button class="btn btn-secondary" (click)="close()">Close</button>
      <button class="btn btn-primary" (click)="copyFullLog()">
        <lucide-icon name="copy" size="16"></lucide-icon>
        Copy Log
      </button>
    </ng-template>
  `,
  styleUrl: './log-details-modal.component.scss'
})
export class LogDetailsModalComponent {
  private toastr = inject(ToastrService);
  private modalService = inject(ModalService);

  bodyTemplate = viewChild<TemplateRef<any>>('bodyTemplate');
  footerTemplate = viewChild<TemplateRef<any>>('footerTemplate');

  // Internal state
  log = signal<Log | null>(null);
  copied = signal<boolean>(false);

  // Computed properties
  isJsonContent = computed(() => {
    const logData = this.log();
    if (!logData) return false;

    const line = logData.line.trim();
    return (line.startsWith('{') && line.endsWith('}')) ||
           (line.startsWith('[') && line.endsWith(']'));
  });

  formattedJson = computed(() => {
    const logData = this.log();
    if (!logData || !this.isJsonContent()) return '';

    try {
      const parsed = JSON.parse(logData.line);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return logData.line; // Fallback to original if not valid JSON
    }
  });

  open(log: Log): void {
    this.log.set(log);

    const body = this.bodyTemplate();
    const footer = this.footerTemplate();

    this.modalService.open('Log Details', body, footer, undefined, 'large');
  }

  close(): void {
    this.modalService.close();
  }

  copyFullLog(): void {
    const logData = this.log();
    if (!logData) return;

    const logText = this.isJsonContent() ?
      this.formattedJson() :
      `[${logData.timeStamp}] [${logData.pod}] [${logData.logLevel}] ${logData.line}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(logText).then(() => {
        this.showCopySuccess();
      }).catch(() => {
        this.fallbackCopy(logText);
      });
    } else {
      this.fallbackCopy(logText);
    }
  }

  private fallbackCopy(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand('copy');
      this.showCopySuccess();
    } catch (err) {
      this.toastr.error('Failed to copy log', '', {
        timeOut: 2000,
        positionClass: 'toast-bottom-right'
      });
    }

    document.body.removeChild(textArea);
  }

  private showCopySuccess(): void {
    this.copied.set(true);
    this.toastr.success('Log copied to clipboard', '', {
      timeOut: 2000,
      positionClass: 'toast-bottom-right'
    });

    setTimeout(() => {
      this.copied.set(false);
    }, 2000);
  }
}