import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LogViewportComponent } from "./log-viewport/log-viewport.component";

@Component({
  selector: 'app-main-log-page',
  standalone: true,
  imports: [
    CommonModule,
    LogViewportComponent
],
  template: `
  <app-log-viewport></app-log-viewport>
  `,
  styleUrl: './main-log-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLogPageComponent { }
