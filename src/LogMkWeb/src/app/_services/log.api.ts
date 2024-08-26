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
    loglevel: string,
    podName: string,
    search: string = '',
    startDate: Date | null,
    page: number = 1,
    pageSize: number = 60
  ) {
    let params = new HttpParams();
    if (loglevel && loglevel !== 'All') {
      params = params.append('loglevel', loglevel);
    }

    if (podName && podName !== 'All') {
      params = params.append('podName', podName);
    }
    if (search && search !== '') {
      params = params.append('search', search);
    }
    if (startDate) {
      params = params.append('dateStart', startDate.toISOString());
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
