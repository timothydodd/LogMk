import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Log } from './signalr.service';

@Injectable({
  providedIn: 'root',
})
export class LogApiService {
  httpClient = inject(HttpClient);

  public getLogs(loglevel: string, page: number = 1, pageSize: number = 60) {
    let params = new HttpParams();
    if (loglevel && loglevel !== 'All') {
      params = params.append('loglevel', loglevel);
    }
    params = params.append('page', page.toString());
    params = params.append('pageSize', pageSize.toString());
    const url = `${environment.apiUrl}/api/log`;
    return this.httpClient.get<PagedResults<Log>>(url, { params });
  }
}
export class PagedResults<T> {
  items?: T[];
  totalCount?: number;
}
