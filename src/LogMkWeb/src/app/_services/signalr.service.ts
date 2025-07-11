import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SignalRService implements OnDestroy {
  private hubConnection?: signalR.HubConnection;
  private reconnectTimer?: number;
  private currentToken?: string;

  public logsReceived = new Subject<Log[]>();

  public startConnection(token: string) {
    // Store token for reconnection scenarios
    this.currentToken = token;
    
    // Disconnect existing connection if any
    this.disconnect();

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/loghub`, {
        accessTokenFactory: () => token,
      })
      .withAutomaticReconnect([0, 2000, 10000, 30000]) // Automatic reconnection with backoff
      .build();

    // Setup connection event handlers
    this.setupConnectionHandlers();

    this.hubConnection
      .start()
      .then(() => {
        console.log('SignalR connection started successfully');
        this.addTransferLogDataListener();
      })
      .catch((err) => {
        console.error('Error while starting SignalR connection:', err);
        this.scheduleReconnection();
      });
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.hubConnection) {
      this.hubConnection.stop().catch((err) => {
        console.error('Error stopping SignalR connection:', err);
      });
      this.hubConnection = undefined;
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.hubConnection) return;

    this.hubConnection.onclose((error) => {
      console.warn('SignalR connection closed:', error);
      this.scheduleReconnection();
    });

    this.hubConnection.onreconnecting((error) => {
      console.log('SignalR reconnecting:', error);
    });

    this.hubConnection.onreconnected((connectionId) => {
      console.log('SignalR reconnected with connection ID:', connectionId);
    });
  }

  private scheduleReconnection(): void {
    if (this.reconnectTimer || !this.currentToken) return;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.currentToken) {
        console.log('Attempting to reconnect SignalR...');
        this.startConnection(this.currentToken);
      }
    }, 5000);
  }

  private addTransferLogDataListener(): void {
    this.hubConnection?.on('ReceiveLog', (data) => {
      try {
        const logs = <Log[]>data;
        this.logsReceived.next(logs);
      } catch (error) {
        console.error('Error processing received logs:', error);
      }
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.logsReceived.complete();
  }
}

export interface Log {
  id: number;
  deployment: string;
  pod: string;
  line: string;
  view: string;
  logLevel: string;
  timeStamp: Date;
  podColor:string;
}
