import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-filter-controls',
  standalone: true,
  imports: [CommonModule, FormsModule, NgSelectModule],
  template: ` <ng-select
    [items]="logLevels"
    [ngModel]="logFilterState.selectedLogLevel()"
    (ngModelChange)="logFilterState.selectedLogLevel.set($event)"
  ></ng-select>`,
  styleUrl: './log-filter-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogFilterControlsComponent {
  logFilterState = inject(LogFilterState);

  logLevels = ['All', 'Debug', 'Information', 'Warning', 'Error'];
}
