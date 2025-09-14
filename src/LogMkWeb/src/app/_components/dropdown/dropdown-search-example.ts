import { Component } from '@angular/core';
import { DropdownComponent } from './dropdown.component';

@Component({
  selector: 'app-dropdown-search-example',
  standalone: true,
  imports: [DropdownComponent],
  template: `
    <div style="padding: 2rem; max-width: 400px;">
      <h3>Single Select with Search</h3>
      <app-dropdown
        [options]="countries"
        [searchable]="true"
        searchPlaceholder="Search countries..."
        placeholder="Select a country"
        (selectionChange)="onSingleSelect($event)"
      />

      <h3 style="margin-top: 2rem;">Multi-Select with Search and Select All</h3>
      <app-dropdown
        [options]="technologies"
        [multiple]="true"
        [searchable]="true"
        [showSelectAll]="true"
        searchPlaceholder="Search technologies..."
        placeholder="Select technologies"
        selectAllLabel="Select All Technologies"
        (selectionChange)="onMultiSelect($event)"
      />

      <h3 style="margin-top: 2rem;">Multi-Select with Count Display</h3>
      <app-dropdown
        [options]="technologies"
        [multiple]="true"
        [searchable]="true"
        [showSelectAll]="true"
        [showCount]="true"
        searchPlaceholder="Filter options..."
        placeholder="Choose items"
        (selectionChange)="onMultiSelect($event)"
      />
    </div>
  `
})
export class DropdownSearchExampleComponent {
  countries = [
    { value: 'us', label: 'United States' },
    { value: 'ca', label: 'Canada' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'de', label: 'Germany' },
    { value: 'fr', label: 'France' },
    { value: 'it', label: 'Italy' },
    { value: 'es', label: 'Spain' },
    { value: 'au', label: 'Australia' },
    { value: 'jp', label: 'Japan' },
    { value: 'cn', label: 'China' },
    { value: 'in', label: 'India' },
    { value: 'br', label: 'Brazil' },
    { value: 'mx', label: 'Mexico' },
    { value: 'ru', label: 'Russia' },
    { value: 'za', label: 'South Africa' }
  ];

  technologies = [
    { value: 'angular', label: 'Angular' },
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue.js' },
    { value: 'svelte', label: 'Svelte' },
    { value: 'ember', label: 'Ember.js' },
    { value: 'backbone', label: 'Backbone.js' },
    { value: 'jquery', label: 'jQuery' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'csharp', label: 'C#' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'swift', label: 'Swift' }
  ];

  onSingleSelect(value: any) {
    console.log('Single selection:', value);
  }

  onMultiSelect(values: any[]) {
    console.log('Multi selection:', values);
  }
}