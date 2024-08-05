import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { environment } from "../../environments/environment";
import { Log } from "./signalr.service";

@Injectable({
  providedIn: 'root'
})
export class LogApiService {

    httpClient = inject(HttpClient)

    public getLogs() {
        return  this.httpClient.get<Log[]>(`${environment.apiUrl}/api/log`);
    }

}