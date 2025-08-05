import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkQueueService, WorkQueueItem } from '../../_services/work-queue.service';
import { SignalRService } from '../../_services/signalr.service';
import { Subject, takeUntil, interval } from 'rxjs';

@Component({
  selector: 'app-work-queue',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work-queue.component.html',
  styleUrl: './work-queue.component.scss'
})
export class WorkQueueComponent implements OnInit, OnDestroy {
  private workQueueService = inject(WorkQueueService);
  private signalRService = inject(SignalRService);
  private destroy$ = new Subject<void>();
  
  workQueueItems = signal<WorkQueueItem[]>([]);
  isLoading = signal(false);
  
  ngOnInit(): void {
    this.loadWorkQueueItems();
    
    // Subscribe to SignalR updates
    this.signalRService.workQueueProgress
      .pipe(takeUntil(this.destroy$))
      .subscribe(update => {
        this.workQueueService.updateWorkQueueProgress(update);
        // Reload items when status changes
        if (update.status === 'COMPLETED' || update.status === 'FAILED') {
          this.loadWorkQueueItems();
        }
      });
    
    // Subscribe to work queue items from service
    this.workQueueService.workQueueItems$
      .pipe(takeUntil(this.destroy$))
      .subscribe(items => {
        this.workQueueItems.set(items);
      });
    
    // Auto-refresh every 30 seconds
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadWorkQueueItems();
      });
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  loadWorkQueueItems(): void {
    this.isLoading.set(true);
    this.workQueueService.getAll(50).subscribe({
      next: (items) => {
        this.workQueueItems.set(items);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading work queue items:', error);
        this.isLoading.set(false);
      }
    });
  }
  
  refresh(): void {
    this.loadWorkQueueItems();
  }
  
  async cancelItem(item: WorkQueueItem): Promise<void> {
    if (confirm(`Are you sure you want to cancel this ${item.type} operation?`)) {
      this.workQueueService.cancel(item.id).subscribe({
        next: () => {
          this.loadWorkQueueItems();
        },
        error: (error) => {
          console.error('Error cancelling work queue item:', error);
          alert('Failed to cancel operation. It may already be in progress.');
        }
      });
    }
  }
  
  getStatusClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'text-warning';
      case 'IN_PROGRESS':
        return 'text-info';
      case 'COMPLETED':
        return 'text-success';
      case 'FAILED':
        return 'text-danger';
      case 'CANCELLED':
        return 'text-secondary';
      default:
        return '';
    }
  }
  
  getProgressBarClass(status: string): string {
    switch (status) {
      case 'IN_PROGRESS':
        return 'progress-bar-striped progress-bar-animated bg-info';
      case 'COMPLETED':
        return 'bg-success';
      case 'FAILED':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }
  
  formatElapsedTime(item: WorkQueueItem): string {
    if (!item.startedAt) return '-';
    
    const start = new Date(item.startedAt);
    const end = item.completedAt ? new Date(item.completedAt) : new Date();
    const elapsedMs = end.getTime() - start.getTime();
    
    const seconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  formatEstimatedTimeRemaining(seconds?: number): string {
    if (!seconds) return '-';
    
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `~${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `~${minutes}m`;
    } else {
      return `~${Math.floor(seconds)}s`;
    }
  }
}
