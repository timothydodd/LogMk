import { CommonModule } from '@angular/common';
import { Component, computed, effect, ElementRef, forwardRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

export interface DropdownOption {
  value: any;
  label: string;
  disabled?: boolean;
}

export interface TriStateOption {
  value: any;
  label: string;
  state: 'unspecified' | 'included' | 'excluded'; // unspecified, included, excluded
  disabled?: boolean;
}

export interface TriStateValue {
  included: any[];
  excluded: any[];
}

export interface DropdownItem {
  label?: string;
  value?: any;
  [key: string]: any;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  template: `
    <div class="dropdown-container" [class.disabled]="disabled()" [class.multiple]="multiple()" [class.dropdown-sm]="size() === 'sm'" [class.compact]="size() === 'compact'" [class.dropdown-lg]="size() === 'lg'">
      <div
        class="dropdown-trigger"
        [class.focused]="isOpen()"
        [class.disabled]="disabled()"
        (click)="toggle()"
        #trigger
      >
        <div class="dropdown-value">
          @if (triState()) {
            @if (triStateValue().included.length === 0 && triStateValue().excluded.length === 0) {
              <span class="placeholder">{{ placeholder() }}</span>
            } @else {
              <div class="tri-state-summary">
                @if (triStateValue().included.length > 0) {
                  <span class="included-count">
                    <span class="count-badge">{{ triStateValue().included.length }}</span>
                    <span class="count-text">included</span>
                  </span>
                }
                @if (triStateValue().excluded.length > 0) {
                  <span class="excluded-count">
                    <span class="count-badge">{{ triStateValue().excluded.length }}</span>
                    <span class="count-text">excluded</span>
                  </span>
                }
              </div>
            }
          } @else if (multiple()) {
            @if (selectedItems().length === 0) {
              <span class="placeholder">{{ placeholder() }}</span>
            } @else if (showCount() || selectedItems().length > maxTagsDisplay()) {
              <div class="selected-count">
                <span class="count-badge">{{ selectedItems().length }}</span>
                <span class="count-text">
                  {{ selectedItems().length === 1 ? 'item' : 'items' }} selected
                </span>
              </div>
            } @else {
              <div class="selected-tags">
                @for (item of selectedItems(); track item.value) {
                  <span class="tag">
                    {{ item.label }}
                    <lucide-icon name="x" size="12" (click)="removeItem($event, item)"></lucide-icon>
                  </span>
                }
              </div>
            }
          } @else {
            <span [class.placeholder]="!selectedLabel()">
              {{ selectedLabel() || placeholder() }}
            </span>
          }
        </div>
        <lucide-icon
          name="chevron-down"
          size="16"
          class="dropdown-arrow"
          [class.rotated]="isOpen()"
        ></lucide-icon>
      </div>

      @if (isOpen()) {
        <div class="dropdown-panel" [style.min-width.px]="minWidth()">
          @if (searchable()) {
            <div class="dropdown-search">
              <lucide-icon name="search" size="16" class="search-icon"></lucide-icon>
              <input
                type="text"
                class="search-input"
                [placeholder]="searchPlaceholder()"
                [(ngModel)]="searchTerm"
                (ngModelChange)="onSearchChange()"
                (click)="$event.stopPropagation()"
                #searchInput
              />
            </div>
          }
          @if (multiple() && showSelectAll() && filteredOptions().length > 0) {
            <div class="dropdown-select-all">
              <div
                class="dropdown-item select-all-item"
                (click)="toggleSelectAll()"
              >
                <input
                  type="checkbox"
                  [checked]="isAllSelected()"
                  [indeterminate]="isIndeterminate()"
                  (click)="$event.stopPropagation(); toggleSelectAll()"
                />
                <span class="select-all-label">{{ selectAllLabel() }}</span>
              </div>
            </div>
          }
          <div class="dropdown-items">
            @if (triState()) {
              @for (option of filteredTriStateOptions(); track option.value) {
                <div
                  class="dropdown-item tri-state-item"
                  [class.included]="option.state === 'included'"
                  [class.excluded]="option.state === 'excluded'"
                  [class.disabled]="option.disabled"
                  (click)="selectTriStateOption(option)"
                >
                  <div class="tri-state-icon">
                    @if (option.state === 'included') {
                      <lucide-icon name="check" size="14" class="include-icon"></lucide-icon>
                    } @else if (option.state === 'excluded') {
                      <lucide-icon name="x" size="14" class="exclude-icon"></lucide-icon>
                    } @else {
                      <div class="unspecified-icon"></div>
                    }
                  </div>
                  {{ option.label }}
                </div>
              }
            } @else {
              @for (option of filteredOptions(); track option.value) {
                <div
                  class="dropdown-item"
                  [class.selected]="isSelected(option)"
                  [class.disabled]="option.disabled"
                  (click)="selectOption(option)"
                >
                  @if (multiple()) {
                    <input
                      type="checkbox"
                      [checked]="isSelected(option)"
                      [disabled]="option.disabled"
                      (click)="$event.stopPropagation(); selectOption(option)"
                    />
                  }
                  {{ option.label }}
                </div>
              }
            }
            @if (filteredOptions().length === 0) {
              <div class="dropdown-item disabled">
                {{ searchTerm() ? 'No matching options' : 'No options available' }}
              </div>
            }
          </div>
          <ng-content select="[slot=custom-content]"></ng-content>
        </div>
      }
    </div>
  `,
  styleUrl: './dropdown.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DropdownComponent),
      multi: true
    }
  ]
})
export class DropdownComponent implements ControlValueAccessor {
  // Modern signal-based inputs
  options = input<DropdownOption[]>([]);
  items = input<any[]>([]); // For compatibility with ng-select
  bindLabel = input<string>('label'); // For compatibility with ng-select
  bindValue = input<string | null>('value'); // For compatibility with ng-select
  placeholder = input<string>('Select an option');
  disabled = input<boolean>(false);
  multiple = input<boolean>(false);
  minWidth = input<number>(200);
  maxTagsDisplay = input<number>(3); // Show count instead of tags when more than this number
  showCount = input<boolean>(false); // Always show count instead of tags
  searchable = input<boolean>(false); // Enable search functionality
  searchPlaceholder = input<string>('Search...');
  showSelectAll = input<boolean>(false); // Show select all option for multi-select
  selectAllLabel = input<string>('Select All');
  size = input<'sm' | 'compact' | 'lg' | undefined>(undefined); // Size variant
  triState = input<boolean>(false); // Enable tri-state mode (include/exclude/unspecified)
  
  // Modern signal-based outputs
  selectionChange = output<any>();
  
  // ViewChild as signal
  trigger = viewChild<ElementRef>('trigger');
  searchInput = viewChild<ElementRef>('searchInput');

  // Component state signals
  isOpen = signal(false);
  selectedValue = signal<any>(null);
  selectedLabel = signal<string>('');
  selectedItems = signal<DropdownOption[]>([]);
  searchTerm = signal<string>('');
  triStateOptions = signal<TriStateOption[]>([]);
  triStateValue = signal<TriStateValue>({ included: [], excluded: [] });
  
  // Computed signals
  processedOptions = computed(() => {
    if (this.options().length > 0) {
      return this.options();
    }

    // Convert items to options format for ng-select compatibility
    return this.items().map(item => {
      if (typeof item === 'string') {
        return { value: item, label: item };
      }
      return {
        value: this.bindValue() ? item[this.bindValue()!] : item,
        label: this.bindLabel() ? item[this.bindLabel()] : item.label || item,
        disabled: item.disabled || false
      };
    });
  });

  // Filtered options based on search term
  filteredOptions = computed(() => {
    const search = this.searchTerm().toLowerCase().trim();
    const options = this.processedOptions();

    if (!search || !this.searchable()) {
      return options;
    }

    return options.filter(option =>
      option.label.toLowerCase().includes(search)
    );
  });

  // Filtered tri-state options based on search term
  filteredTriStateOptions = computed(() => {
    const search = this.searchTerm().toLowerCase().trim();
    const options = this.triStateOptions();

    if (!search || !this.searchable()) {
      return options;
    }

    return options.filter(option =>
      option.label.toLowerCase().includes(search)
    );
  });

  // Check if all filtered options are selected
  isAllSelected = computed(() => {
    const filtered = this.filteredOptions();
    const selected = this.selectedItems();

    if (filtered.length === 0) return false;

    return filtered
      .filter(opt => !opt.disabled)
      .every(opt => selected.some(item => item.value === opt.value));
  });

  // Check if some but not all options are selected
  isIndeterminate = computed(() => {
    const filtered = this.filteredOptions();
    const selected = this.selectedItems();

    if (filtered.length === 0) return false;

    const enabledOptions = filtered.filter(opt => !opt.disabled);
    const selectedCount = enabledOptions.filter(opt =>
      selected.some(item => item.value === opt.value)
    ).length;

    return selectedCount > 0 && selectedCount < enabledOptions.length;
  });
  
  // Injected dependencies
  private elementRef = inject(ElementRef);
  
  private onChange = (value: any) => {};
  private onTouched = () => {};
  private lastWrittenValue: any = null;
  
  constructor() {
    // Effect to update selected items when options change
    effect(() => {
      const options = this.processedOptions();
      if (options.length > 0 && this.lastWrittenValue !== null) {
        // Re-apply the last written value now that we have options
        this.writeValue(this.lastWrittenValue);
      }
    });

    // Effect to initialize tri-state options when options change
    effect(() => {
      const options = this.processedOptions();
      if (this.triState() && options.length > 0) {
        const currentTriStateValue = this.triStateValue();
        const triStateOptions = options.map(opt => {
          let state: 'unspecified' | 'included' | 'excluded' = 'unspecified';
          if (currentTriStateValue.included.includes(opt.value)) {
            state = 'included';
          } else if (currentTriStateValue.excluded.includes(opt.value)) {
            state = 'excluded';
          }
          return {
            value: opt.value,
            label: opt.label,
            state,
            disabled: opt.disabled
          };
        });
        this.triStateOptions.set(triStateOptions);
      }
    });

    // Effect to focus search input when dropdown opens
    effect(() => {
      if (this.isOpen() && this.searchable()) {
        setTimeout(() => {
          const input = this.searchInput();
          if (input) {
            input.nativeElement.focus();
          }
        }, 50);
      } else {
        // Clear search when closing
        this.searchTerm.set('');
      }
    });
  }
  
  isSelected(option: DropdownOption): boolean {
    if (this.multiple()) {
      return this.selectedItems().some(item => item.value === option.value);
    }
    return this.selectedValue() === option.value;
  }
  
  toggle() {
    if (this.disabled()) return;

    this.isOpen.set(!this.isOpen());
    if (this.isOpen()) {
      this.onTouched();
    }
  }

  onSearchChange() {
    // This method is called when search term changes
    // The filtering is handled by the computed signal
  }

  toggleSelectAll() {
    if (!this.multiple()) return;

    const filtered = this.filteredOptions().filter(opt => !opt.disabled);
    const selected = this.selectedItems();
    const isAllSelected = this.isAllSelected();

    if (isAllSelected) {
      // Deselect all filtered items
      const valuesToRemove = filtered.map(opt => opt.value);
      const newItems = selected.filter(item =>
        !valuesToRemove.includes(item.value)
      );
      this.selectedItems.set(newItems);
      const values = newItems.map(item => item.value);
      this.onChange(values);
      this.selectionChange.emit(values);
    } else {
      // Select all filtered items that aren't already selected
      const existingValues = selected.map(item => item.value);
      const newOptions = filtered.filter(opt =>
        !existingValues.includes(opt.value)
      );
      const newItems = [...selected, ...newOptions];
      this.selectedItems.set(newItems);
      const values = newItems.map(item => item.value);
      this.onChange(values);
      this.selectionChange.emit(values);
    }
  }
  
  selectOption(option: DropdownOption) {
    if (option.disabled) return;

    if (this.multiple()) {
      const currentItems = this.selectedItems();
      const isCurrentlySelected = currentItems.some(item => item.value === option.value);

      if (isCurrentlySelected) {
        // Remove item
        const newItems = currentItems.filter(item => item.value !== option.value);
        this.selectedItems.set(newItems);
        const values = newItems.map(item => item.value);
        this.onChange(values);
        this.selectionChange.emit(values);
      } else {
        // Add item
        const newItems = [...currentItems, option];
        this.selectedItems.set(newItems);
        const values = newItems.map(item => item.value);
        this.onChange(values);
        this.selectionChange.emit(values);
      }
    } else {
      this.selectedValue.set(option.value);
      this.selectedLabel.set(option.label);
      this.isOpen.set(false);

      this.onChange(option.value);
      this.selectionChange.emit(option.value);
    }
  }

  selectTriStateOption(option: TriStateOption) {
    if (option.disabled) return;

    const currentOptions = this.triStateOptions();
    const updatedOptions = currentOptions.map(opt => {
      if (opt.value === option.value) {
        // Cycle through states: unspecified -> included -> excluded -> unspecified
        let newState: 'unspecified' | 'included' | 'excluded' = 'unspecified';
        switch (opt.state) {
          case 'unspecified':
            newState = 'included';
            break;
          case 'included':
            newState = 'excluded';
            break;
          case 'excluded':
            newState = 'unspecified';
            break;
        }
        return { ...opt, state: newState };
      }
      return opt;
    });

    this.triStateOptions.set(updatedOptions);

    // Build the tri-state value
    const included = updatedOptions.filter(opt => opt.state === 'included').map(opt => opt.value);
    const excluded = updatedOptions.filter(opt => opt.state === 'excluded').map(opt => opt.value);
    const triStateValue: TriStateValue = { included, excluded };

    this.triStateValue.set(triStateValue);
    this.onChange(triStateValue);
    this.selectionChange.emit(triStateValue);
  }
  
  removeItem(event: Event, item: DropdownOption) {
    event.stopPropagation();
    if (this.disabled()) return;
    
    const currentItems = this.selectedItems();
    const newItems = currentItems.filter(i => i.value !== item.value);
    this.selectedItems.set(newItems);
    const values = newItems.map(item => item.value);
    this.onChange(values);
    this.selectionChange.emit(values);
  }
  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
  
  // ControlValueAccessor implementation
  writeValue(value: any): void {
    this.lastWrittenValue = value;

    if (this.triState()) {
      // Handle tri-state value
      if (value && typeof value === 'object' && 'included' in value && 'excluded' in value) {
        const triStateValue = value as TriStateValue;
        this.triStateValue.set(triStateValue);

        // Update tri-state options based on the value
        const options = this.processedOptions();
        const triStateOptions = options.map(opt => {
          let state: 'unspecified' | 'included' | 'excluded' = 'unspecified';
          if (triStateValue.included.includes(opt.value)) {
            state = 'included';
          } else if (triStateValue.excluded.includes(opt.value)) {
            state = 'excluded';
          }
          return {
            value: opt.value,
            label: opt.label,
            state,
            disabled: opt.disabled
          };
        });
        this.triStateOptions.set(triStateOptions);
      } else {
        // Initialize with empty tri-state value
        this.triStateValue.set({ included: [], excluded: [] });
        const options = this.processedOptions();
        const triStateOptions = options.map(opt => ({
          value: opt.value,
          label: opt.label,
          state: 'unspecified' as const,
          disabled: opt.disabled
        }));
        this.triStateOptions.set(triStateOptions);
      }
    } else if (this.multiple()) {
      const values = Array.isArray(value) ? value : [];
      const options = this.processedOptions();

      // If options aren't loaded yet, store the raw values
      if (options.length === 0 && values.length > 0) {
        // Create temporary options from the values
        const tempItems = values.map(v => ({ value: v, label: v }));
        this.selectedItems.set(tempItems);
      } else {
        const selectedItems = values.map(v =>
          options.find(opt => opt.value === v) || { value: v, label: v }
        ).filter(Boolean) as DropdownOption[];
        this.selectedItems.set(selectedItems);
      }
    } else {
      this.selectedValue.set(value);
      const option = this.processedOptions().find(opt => opt.value === value);
      this.selectedLabel.set(option?.label || value || '');
    }
  }
  
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }
  
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }
  
  setDisabledState(isDisabled: boolean): void {
    // Note: With signal inputs, disabled state is managed by parent component
    // This method is required by ControlValueAccessor but cannot directly modify signal inputs
  }
}