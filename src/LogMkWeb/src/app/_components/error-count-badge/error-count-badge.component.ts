import { Component, inject, signal, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Log, SignalRService } from '../../_services/signalr.service';

@Component({
  selector: 'app-error-count-badge',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (errorCount() > 0) {
      <button
        class="error-badge"
        [class.pulsing]="hasNewErrors()"
        (click)="onBadgeClick()"
        title="Click to filter error logs">
        <lucide-icon name="alert-triangle" size="16"></lucide-icon>
        <span class="count">{{ formatCount(errorCount()) }}</span>
      </button>
    }
  `,
  styleUrl: './error-count-badge.component.scss'
})
export class ErrorCountBadgeComponent {
  private signalRService = inject(SignalRService);
  private router = inject(Router);

  errorCount = signal<number>(0);
  hasNewErrors = signal<boolean>(false);
  badgeClick = output<void>();

  constructor() {
    // Listen to incoming logs from SignalR
    this.signalRService.logsReceived.pipe(takeUntilDestroyed()).subscribe((logs: Log[]) => {
      this.updateErrorCount(logs);
    });
  }

  private updateErrorCount(logs: Log[]) {
    const errorLogs = logs.filter(log => log.logLevel === 'Error');
    const newErrorCount = errorLogs.length;
    const previousCount = this.errorCount();

    if (newErrorCount > previousCount) {
      // New errors detected
      this.hasNewErrors.set(true);
      // Stop pulsing after 3 seconds
      setTimeout(() => {
        this.hasNewErrors.set(false);
      }, 3000);
    }

    this.errorCount.set(newErrorCount);
  }

  formatCount(count: number): string {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
  }

  onBadgeClick() {
    this.badgeClick.emit();
    // Navigate to main log page if not already there
    if (this.router.url !== '/') {
      this.router.navigate(['/']);
    }
  }
}
