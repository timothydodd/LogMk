import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { Log } from '../../_services/signalr.service';
import { ModalComponent, ModalContainerService, ModalLayoutComponent, ToastService } from '@rd-ui';
import { TimestampFormatPipe } from '../../_pipes/timestamp-format.pipe';
import { HighlightLogPipe } from '../../_pages/main-log-page/_services/highlight.directive';

@Component({
  selector: 'app-log-details-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TimestampFormatPipe, HighlightLogPipe, ModalLayoutComponent],
  template: `
    <rd-modal-layout [title]="'Log Details'">
      <div slot="body" class="log-details-content">
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

      <div slot="footer">
        <button class="btn btn-secondary" (click)="close()">Close</button>
        <button class="btn btn-primary" (click)="copyFullLog()">
          <lucide-icon name="copy" size="16"></lucide-icon>
          Copy Log
        </button>
      </div>
    </rd-modal-layout>
  `,
  styleUrl: './log-details-modal.component.scss'
})
export class LogDetailsModalComponent implements OnInit {
  private toast = inject(ToastService);
  private modalContainerService = inject(ModalContainerService);
  private modalComponent = inject(ModalComponent);

  // Log data from modal config
  log = signal<Log | null>(null);
  copied = signal<boolean>(false);

  ngOnInit(): void {
    // Get the log data from the modal config
    const data = this.modalComponent.config?.data;
    if (data?.log) {
      this.log.set(data.log);
    }
  }

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

  close(): void {
    this.modalContainerService.closeAll();
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
      this.toast.error('Failed to copy log', undefined, 2000);
    }

    document.body.removeChild(textArea);
  }

  private showCopySuccess(): void {
    this.copied.set(true);
    this.toast.success('Log copied to clipboard', undefined, 2000);

    setTimeout(() => {
      this.copied.set(false);
    }, 2000);
  }
}