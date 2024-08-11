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

  public startConnection() {
    this.hubConnection = new signalR.HubConnectionBuilder().withUrl(`${environment.apiUrl}/loghub`).build();

    this.hubConnection
      .start()
      .then(() => console.log('Connection started'))
      .catch((err) => console.log('Error while starting connection: ' + err));
    this.addTransferLogDataListener();
  }

  private addTransferLogDataListener() {
    this.hubConnection?.on('ReceiveLog', (data) => {
      const a = <Log[]>data;
      this.logsReceived.next(a);
    });
  }

  public sendMessage(message: string) {
    this.hubConnection?.invoke('SendMessage', message).catch((err) => console.error(err));
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
