import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Log } from './signalr.service';

@Injectable({
  providedIn: 'root',
})
export class LogApiService {
  httpClient = inject(HttpClient);

  public getDeploymentSummaries() {
    const url = `${environment.apiUrl}/api/log/deployment-summaries`;
    return this.httpClient.get<any[]>(url);
  }

  public getPodSummaries() {
    const url = `${environment.apiUrl}/api/log/pod-summaries`;
    return this.httpClient.get<any[]>(url);
  }

  public purgeLogs(deployment: string, timeRange: string) {
    const url = `${environment.apiUrl}/api/log/purge`;
    return this.httpClient.post(url, { deployment, timeRange });
  }

  public purgeLogsByPod(pod: string, timeRange: string) {
    const url = `${environment.apiUrl}/api/log/purge`;
    return this.httpClient.post(url, { pod, timeRange });
  }

  public getLogs(
    loglevel: string[] | null,
    podName: string[] | null,
    search: string = '',
    startDate: Date | null,
    endDate?: Date | null,
    page: number = 1,
    pageSize: number = 200,
    excludeLogLevel: string[] | null = null,
    excludePodName: string[] | null = null,
    excludeSearch: string = ''
  ) {
    let params = new HttpParams();
    if (loglevel && loglevel.length > 0) {
      for (const level of loglevel) {
        params = params.append('loglevel', level);
      }
    }

    if (podName && podName.length > 0) {
      for (const pod of podName) {
        params = params.append('podName', pod);
      }
    }
    if (search && search !== '') {
      params = params.append('search', search);
    }
    if (startDate) {
      params = params.append('dateStart', startDate.toISOString());
    }
    if (endDate) {
      params = params.append('dateEnd', endDate.toISOString());
    }

    // Add exclude parameters
    if (excludeLogLevel && excludeLogLevel.length > 0) {
      for (const level of excludeLogLevel) {
        params = params.append('excludeLogLevel', level);
      }
    }

    if (excludePodName && excludePodName.length > 0) {
      for (const pod of excludePodName) {
        params = params.append('excludePodName', pod);
      }
    }

    if (excludeSearch && excludeSearch !== '') {
      params = params.append('excludeSearch', excludeSearch);
    }

    params = params.append('page', page.toString());
    params = params.append('pageSize', pageSize.toString());
    const url = `${environment.apiUrl}/api/log`;
    return this.httpClient.get<PagedResults<Log>>(url, { params });
  }
  public getPods() {
    const url = `${environment.apiUrl}/api/log/pods`;
    return this.httpClient.get<Pod[]>(url);
  }
  public getStats(loglevel: string[] | null, podName: string[] | null, search: string = '', startDate: Date | null, endDate?: Date | null, excludeLogLevel: string[] | null = null, excludePodName: string[] | null = null, excludeSearch: string = '') {
    let params = new HttpParams();
    if (loglevel && loglevel.length > 0) {
      for (const ll of loglevel) {
        params = params.append('loglevel', ll);
      }
    }

    if (podName && podName.length > 0) {
      for (const pod of podName) {
        params = params.append('podName', pod);
      }
    }
    if (search && search !== '') {
      params = params.append('search', search);
    }
    if (startDate) {
      params = params.append('dateStart', startDate.toISOString());
    }
    if (endDate) {
      params = params.append('dateEnd', endDate.toISOString());
    }

    // Add exclude parameters for stats
    if (excludeLogLevel && excludeLogLevel.length > 0) {
      for (const level of excludeLogLevel) {
        params = params.append('excludeLogLevel', level);
      }
    }

    if (excludePodName && excludePodName.length > 0) {
      for (const pod of excludePodName) {
        params = params.append('excludePodName', pod);
      }
    }

    // Note: excludeSearch not supported for stats endpoint since summary tables don't contain Line content

    const url = `${environment.apiUrl}/api/log/stats`;
    return this.httpClient.get<LogStatistic>(url, { params });
  }
}
export class PagedResults<T> {
  items?: T[];
  totalCount?: number;
}
export interface Pod {
  name: string;
  deployment: string;
  namespace: string;
  logLevel: string;
}
export interface LogStatistic {
  counts: { [key: string]: { [key: string]: number } };
  timePeriod: TimePeriod;
}
export enum TimePeriod {
  Hour,
  Day,
}
