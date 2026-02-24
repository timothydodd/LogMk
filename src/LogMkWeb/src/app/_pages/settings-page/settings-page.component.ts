import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmDialogService, SelectComponent, ToastService } from '@rd-ui';
import { firstValueFrom } from 'rxjs';
import { WorkQueueComponent } from '../../_components/work-queue/work-queue.component';
import { LogApiService } from '../../_services/log.api';
import { WorkQueueService } from '../../_services/work-queue.service';

interface PodSummary {
  pod: string;
  deployment: string;
  totalCount: number;
  dailyCounts: { date: string; count: number }[];
}

interface TimeRange {
  label: string;
  value: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, SelectComponent, WorkQueueComponent],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent implements OnInit {
  private logApiService = inject(LogApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private workQueueService = inject(WorkQueueService);
  private confirmDialog = inject(ConfirmDialogService);

  pods = signal<PodSummary[]>([]);
  selectedPod = signal<string>('');
  selectedTimeRange = signal<string>('all');
  isLoading = signal(false);
  isPurging = signal(false);
  podHasPendingOperations = signal<{ [key: string]: boolean }>({});

  podControl = new FormControl('');
  timeRangeControl = new FormControl('all');

  timeRanges: TimeRange[] = [
    { label: 'All Time', value: 'all' },
    { label: 'Last Hour', value: 'hour' },
    { label: 'Last Day', value: 'day' },
    { label: 'Last Week', value: 'week' },
    { label: 'Last Month', value: 'month' },
  ];

  async ngOnInit() {
    await this.loadPodSummaries();
    await this.checkPendingOperations();

    // Subscribe to form control changes
    this.podControl.valueChanges.subscribe((value) => {
      if (value) {
        this.selectedPod.set(value);
        this.checkPodPendingOperations(value);
      }
    });

    this.timeRangeControl.valueChanges.subscribe((value) => {
      if (value) this.selectedTimeRange.set(value);
    });
  }

  async loadPodSummaries() {
    try {
      this.isLoading.set(true);
      const summaries = await firstValueFrom(this.logApiService.getPodSummaries());
      this.pods.set(summaries);
      if (summaries.length > 0) {
        this.selectedPod.set(summaries[0].pod);
        this.podControl.setValue(summaries[0].pod);
      }
    } catch (error) {
      this.toast.error('Failed to load pod summaries');
      console.error('Error loading pod summaries:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectPod(pod: string) {
    this.selectedPod.set(pod);
    this.podControl.setValue(pod);
  }

  onPodSelect(pod: string) {
    this.selectedPod.set(pod);
  }

  onTimeRangeSelect(timeRange: string) {
    this.selectedTimeRange.set(timeRange);
  }

  get podOptions() {
    return this.pods().map((p) => ({
      label: `${p.pod} (${p.totalCount.toLocaleString()} logs)`,
      value: p.pod,
    }));
  }

  get timeRangeOptions() {
    return this.timeRanges.map((t) => ({
      label: t.label,
      value: t.value,
    }));
  }

  get selectedPodSummary() {
    return this.pods().find((p) => p.pod === this.selectedPod());
  }

  confirmPurge() {
    const pod = this.selectedPod();
    const timeRange = this.selectedTimeRange();
    const summary = this.selectedPodSummary;

    if (!pod || !summary) {
      this.toast.warning('Please select a pod');
      return;
    }

    const timeRangeLabel = this.timeRanges.find((t) => t.value === timeRange)?.label || 'All Time';

    const message = `Are you sure you want to purge logs for pod "${pod}" (${timeRangeLabel})? This will permanently delete ${summary.totalCount.toLocaleString()} log entries. This action cannot be undone.`;

    this.confirmDialog
      .confirm({
        title: 'Purge Logs',
        message,
        confirmText: 'Purge',
        cancelText: 'Cancel',
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.purgeLogs();
        }
      });
  }

  async purgeLogs() {
    try {
      this.isPurging.set(true);
      const pod = this.selectedPod();
      const timeRange = this.selectedTimeRange();

      // Use work queue service instead of direct purge
      const result = await firstValueFrom(
        this.workQueueService.queuePurge({
          type: 'LOG_PURGE',
          podName: pod,
          timeRange: timeRange,
        })
      );

      this.toast.success(
        `Purge operation queued successfully. Estimated ${result.estimatedRecords?.toLocaleString() || 0} records to delete.`
      );

      // Update pending operations status
      this.podHasPendingOperations.update((current) => ({
        ...current,
        [pod]: true,
      }));

      // Navigate to work queue view
      this.router.navigate(['/settings'], { fragment: 'queue' });
    } catch (error: any) {
      if (error.status === 409) {
        this.toast.error('A purge operation is already pending or in progress for this pod');
      } else {
        this.toast.error('Failed to queue purge operation');
      }
      console.error('Error queueing purge:', error);
    } finally {
      this.isPurging.set(false);
    }
  }

  async checkPendingOperations() {
    try {
      const pods = this.pods();
      for (const pod of pods) {
        await this.checkPodPendingOperations(pod.pod);
      }
    } catch (error) {
      console.error('Error checking pending operations:', error);
    }
  }

  async checkPodPendingOperations(podName: string) {
    try {
      const result = await firstValueFrom(this.workQueueService.getByPod(podName));
      this.podHasPendingOperations.update((current) => ({
        ...current,
        [podName]: result.hasPendingOrActive,
      }));
    } catch (error) {
      console.error(`Error checking pending operations for pod ${podName}:`, error);
    }
  }

  isPodDisabled(podName: string): boolean {
    return this.podHasPendingOperations()[podName] || false;
  }

  navigateBack() {
    this.router.navigate(['/log']);
  }
}
