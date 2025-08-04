import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { DropdownComponent } from '../../_components/dropdown/dropdown.component';
import { ModalService } from '../../_services/modal.service';
import { LogApiService } from '../../_services/log.api';

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
  imports: [FormsModule, ReactiveFormsModule, DropdownComponent],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss'
})
export class SettingsPageComponent implements OnInit {
  private logApiService = inject(LogApiService);
  private modalService = inject(ModalService);
  private toastr = inject(ToastrService);
  private router = inject(Router);

  pods = signal<PodSummary[]>([]);
  selectedPod = signal<string>('');
  selectedTimeRange = signal<string>('all');
  isLoading = signal(false);
  isPurging = signal(false);
  
  podControl = new FormControl('');
  timeRangeControl = new FormControl('all');

  timeRanges: TimeRange[] = [
    { label: 'All Time', value: 'all' },
    { label: 'Last Hour', value: 'hour' },
    { label: 'Last Day', value: 'day' },
    { label: 'Last Week', value: 'week' },
    { label: 'Last Month', value: 'month' }
  ];

  async ngOnInit() {
    await this.loadPodSummaries();
    
    // Subscribe to form control changes
    this.podControl.valueChanges.subscribe(value => {
      if (value) this.selectedPod.set(value);
    });
    
    this.timeRangeControl.valueChanges.subscribe(value => {
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
      this.toastr.error('Failed to load pod summaries');
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
    return this.pods().map(p => ({
      label: `${p.pod} (${p.totalCount.toLocaleString()} logs)`,
      value: p.pod
    }));
  }

  get timeRangeOptions() {
    return this.timeRanges.map(t => ({
      label: t.label,
      value: t.value
    }));
  }

  get selectedPodSummary() {
    return this.pods().find(p => p.pod === this.selectedPod());
  }

  async confirmPurge() {
    const pod = this.selectedPod();
    const timeRange = this.selectedTimeRange();
    const summary = this.selectedPodSummary;
    
    if (!pod || !summary) {
      this.toastr.warning('Please select a pod');
      return;
    }

    const timeRangeLabel = this.timeRanges.find(t => t.value === timeRange)?.label || 'All Time';
    
    const message = `Are you sure you want to purge logs for pod "${pod}" (${timeRangeLabel})? This will permanently delete ${summary.totalCount.toLocaleString()} log entries. This action cannot be undone.`;
    
    const confirmed = await this.modalService.confirm('Confirm Purge', message);
    
    if (confirmed) {
      await this.purgeLogs();
    }
  }

  async purgeLogs() {
    try {
      this.isPurging.set(true);
      const pod = this.selectedPod();
      const timeRange = this.selectedTimeRange();
      
      await firstValueFrom(this.logApiService.purgeLogsByPod(pod, timeRange));
      
      this.toastr.success(`Successfully purged logs for pod "${pod}"`);
      
      // Reload the pod summaries
      await this.loadPodSummaries();
    } catch (error) {
      this.toastr.error('Failed to purge logs');
      console.error('Error purging logs:', error);
    } finally {
      this.isPurging.set(false);
    }
  }

  navigateBack() {
    this.router.navigate(['/log']);
  }
}
