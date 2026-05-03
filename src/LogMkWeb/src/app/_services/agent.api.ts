import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AgentInfo {
  agentId: string;
  hostname: string;
  version?: string;
  ipAddress?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  startedAt?: string;
  lastBatchSentAt?: string;
  queuedItems: number;
  totalItemsProcessed: number;
  totalBatchesSent: number;
  totalFailures: number;
  totalDropped: number;
  circuitBreakerState?: string;
  isOnline: boolean;
}

export type AgentLogLevel = 'Any' | 'Trace' | 'Debug' | 'Information' | 'Warning' | 'Error';

export interface AgentConfig {
  agentId: string;
  defaultLogLevel: AgentLogLevel;
  podLogLevels: { [pod: string]: AgentLogLevel };
  ignoredPods: string[];
  maxDaysOld: number;
  maxLineLength: number;
  maxBatchSize: number;
  maxBatchesPerMinute: number;
  maxQueueSize: number;
  updatedAt?: string;
  updatedBy?: string;
}

@Injectable({ providedIn: 'root' })
export class AgentApiService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/api/agents`;

  list(): Observable<AgentInfo[]> {
    return this.http.get<AgentInfo[]>(this.baseUrl);
  }

  getConfig(agentId: string): Observable<AgentConfig> {
    return this.http.get<AgentConfig>(`${this.baseUrl}/${encodeURIComponent(agentId)}/config`);
  }

  saveConfig(agentId: string, config: AgentConfig): Observable<AgentConfig> {
    return this.http.put<AgentConfig>(`${this.baseUrl}/${encodeURIComponent(agentId)}/config`, config);
  }
}
