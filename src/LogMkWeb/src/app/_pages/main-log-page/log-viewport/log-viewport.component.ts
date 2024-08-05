import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

import { switchMap, take, tap } from 'rxjs';
import { LogApiService } from '../../../_services/log.api';
import { Log, SignalRService } from '../../../_services/signalr.service';
@Component({
  selector: 'app-log-viewport',
  standalone: true,
  imports: [
    CommonModule,
    ScrollingModule,
  ],
  template: `
<cdk-virtual-scroll-viewport itemSize="20" class="log-viewport" #scrollViewport>
  <div *cdkVirtualFor="let log of logs()" class="log-item" >

     <div class="time">{{ log.timeStamp | date:'short' }}</div> <div class="pod">{{log.pod}}</div> <div [ngClass]="log.logLevel" class="line">{{ log.line }}</div>
  </div>

</cdk-virtual-scroll-viewport>
  `,
  styleUrl: './log-viewport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogViewportComponent {
  
  destroyRef = inject(DestroyRef)
  logApi = inject(LogApiService)
  signalRService = inject(SignalRService)
  logs= signal<Log[]>([]);
  viewport = viewChild<CdkVirtualScrollViewport>('scrollViewport');

  constructor(){
    var viewPort = toObservable(this.viewport);
        viewPort.pipe(take(1),switchMap(()=>{
          return     this.logApi.getLogs();
        }),tap(l => {
          this.logs.set(l);
         setTimeout(() => this.scrollToBottom(), 0);
        }),
    switchMap(()=>{
      return this.signalRService.logsReceived;
    }),
    takeUntilDestroyed())
    .subscribe(logs => {
     this.logs.update(items=>[...items, ...logs]);
      setTimeout(() => this.scrollToBottom(), 0);
    });


  }
  private scrollToBottom() {
     this.viewport()?.scrollToIndex(this.logs().length - 1);
  }
}

