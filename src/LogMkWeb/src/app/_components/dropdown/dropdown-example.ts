// Example usage of the custom dropdown component

import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DropdownComponent, DropdownOption } from './dropdown.component';

@Component({
  selector: 'app-dropdown-example',
  standalone: true,
  imports: [DropdownComponent, ReactiveFormsModule],
  template: `
    <div class="example-container">
      <h3>Custom Dropdown Examples</h3>
      
      <!-- Basic dropdown -->
      <div class="form-group">
        <label class="form-label">Select a log level</label>
        <app-dropdown
          [options]="logLevels"
          placeholder="Choose log level"
          (selectionChange)="onLogLevelChange($event)"
        ></app-dropdown>
      </div>
      
      <!-- Dropdown with FormControl -->
      <div class="form-group">
        <label class="form-label">Pod Selection</label>
        <app-dropdown
          [options]="podOptions"
          [formControl]="podControl"
          placeholder="Select a pod"
        ></app-dropdown>
        <div>Selected pod: {{ podControl.value || 'None' }}</div>
      </div>
      
      <!-- Small dropdown -->
      <div class="form-group">
        <label class="form-label">Time Range (Small)</label>
        <app-dropdown
          class="dropdown-sm"
          [options]="timeRanges"
          placeholder="Select time range"
        ></app-dropdown>
      </div>
      
      <!-- Disabled dropdown -->
      <div class="form-group">
        <label class="form-label">Disabled Dropdown</label>
        <app-dropdown
          [options]="logLevels"
          placeholder="This is disabled"
          [disabled]="true"
        ></app-dropdown>
      </div>
    </div>
  `,
  styles: [`
    .example-container {
      padding: 2rem;
      max-width: 400px;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
  `]
})
export class DropdownExampleComponent {
  podControl = new FormControl('');
  
  logLevels: DropdownOption[] = [
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warning' },
    { value: 'error', label: 'Error' },
    { value: 'fatal', label: 'Fatal' }
  ];
  
  podOptions: DropdownOption[] = [
    { value: 'web-app-1', label: 'web-app-1 (Running)' },
    { value: 'web-app-2', label: 'web-app-2 (Running)' },
    { value: 'api-service-1', label: 'api-service-1 (Running)' },
    { value: 'api-service-2', label: 'api-service-2 (Pending)', disabled: true },
    { value: 'database-1', label: 'database-1 (Running)' }
  ];
  
  timeRanges: DropdownOption[] = [
    { value: '5m', label: 'Last 5 minutes' },
    { value: '15m', label: 'Last 15 minutes' },
    { value: '1h', label: 'Last hour' },
    { value: '24h', label: 'Last 24 hours' }
  ];
  
  onLogLevelChange(value: any) {
    console.log('Log level changed:', value);
  }
}