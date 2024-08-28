import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private hubConnection?: signalR.HubConnection;

  public logsReceived = new Subject<Log[]>();

  public startConnection(token: string) {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/loghub`, {
        accessTokenFactory: () => token,
      })
      .build();

    this.hubConnection
      .start()
      .then(() => {
        console.log('Connection started');
        this.addTransferLogDataListener();
      })
      .catch((err) => console.log('Error while starting connection: ' + err));
  }

  private addTransferLogDataListener() {
    this.hubConnection?.on('ReceiveLog', (data) => {
      const a = <Log[]>data;

      this.logsReceived.next(a);
    });
  }
}

export interface Log {
  id: number;
  deployment: string;
  pod: string;
  line: string;
  logLevel: string;
  timeStamp: Date;
}
