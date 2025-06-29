import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Log } from './signalr.service';

@Injectable({
  providedIn: 'root',
})
export class LogApiService {
  httpClient = inject(HttpClient);

  public getLogs(
    loglevel: string[] | null,
    podName: string[] | null,
    search: string = '',
    startDate: Date | null,
    endDate?: Date | null,
    page: number = 1,
    pageSize: number = 200
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

    params = params.append('page', page.toString());
    params = params.append('pageSize', pageSize.toString());
    const url = `${environment.apiUrl}/api/log`;
    return this.httpClient.get<PagedResults<Log>>(url, { params });
  }
  public getPods() {
    const url = `${environment.apiUrl}/api/log/pods`;
    return this.httpClient.get<Pod[]>(url);
  }
  public getStats(loglevel: string[] | null, podName: string[] | null, search: string = '', startDate: Date | null, endDate?: Date | null) {
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
