import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WorkQueueItem {
  id: number;
  type: string;
  status: string;
  podName?: string;
  deployment?: string;
  timeRange?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  recordsAffected?: number;
  estimatedRecords?: number;
  progress: number;
  createdBy?: string;
  elapsedTime?: string;
  estimatedTimeRemaining?: number;
}

export interface WorkQueueStatus {
  items: WorkQueueItem[];
  pendingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

export interface CreateWorkQueueItemRequest {
  type: string;
  podName?: string;
  deployment?: string;
  timeRange?: string;
  metadata?: { [key: string]: any };
}

export interface WorkQueueProgressUpdate {
  id: number;
  status: string;
  progress: number;
  recordsAffected?: number;
  errorMessage?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WorkQueueService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/api/workqueue`;
  
  private workQueueItemsSubject = new BehaviorSubject<WorkQueueItem[]>([]);
  public workQueueItems$ = this.workQueueItemsSubject.asObservable();

  queuePurge(request: CreateWorkQueueItemRequest): Observable<any> {
    return this.http.post(`${this.baseUrl}/purge`, request);
  }

  getAll(limit?: number): Observable<WorkQueueItem[]> {
    const params: Record<string, string> = {};
    if (limit) {
      params['limit'] = limit.toString();
    }
    return this.http.get<WorkQueueItem[]>(this.baseUrl, { params });
  }

  getActive(): Observable<WorkQueueItem[]> {
    return this.http.get<WorkQueueItem[]>(`${this.baseUrl}/active`);
  }

  getByPod(podName: string): Observable<{ hasPendingOrActive: boolean; items: WorkQueueItem[] }> {
    return this.http.get<{ hasPendingOrActive: boolean; items: WorkQueueItem[] }>(
      `${this.baseUrl}/pod/${encodeURIComponent(podName)}`
    );
  }

  getStatus(): Observable<WorkQueueStatus> {
    return this.http.get<WorkQueueStatus>(`${this.baseUrl}/status`);
  }

  cancel(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  // Update local state when receiving SignalR updates
  updateWorkQueueProgress(update: WorkQueueProgressUpdate): void {
    const currentItems = this.workQueueItemsSubject.value;
    const index = currentItems.findIndex(item => item.id === update.id);
    
    if (index !== -1) {
      const updatedItem = {
        ...currentItems[index],
        status: update.status,
        progress: update.progress,
        recordsAffected: update.recordsAffected || currentItems[index].recordsAffected,
        errorMessage: update.errorMessage || currentItems[index].errorMessage
      };
      
      const newItems = [...currentItems];
      newItems[index] = updatedItem;
      this.workQueueItemsSubject.next(newItems);
    }
  }

  // Refresh the work queue items
  refreshWorkQueueItems(): void {
    this.getAll().subscribe(items => {
      this.workQueueItemsSubject.next(items);
    });
  }
}