import { CommonModule } from '@angular/common';
import { Component, computed, effect, ElementRef, forwardRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

export interface DropdownOption {
  value: any;
  label: string;
  disabled?: boolean;
}

export interface DropdownItem {
  label?: string;
  value?: any;
  [key: string]: any;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="dropdown-container" [class.disabled]="disabled()" [class.multiple]="multiple()">
      <div 
        class="dropdown-trigger"
        [class.focused]="isOpen()"
        [class.disabled]="disabled()"
        (click)="toggle()"
        #trigger
      >
        <div class="dropdown-value">
          @if (multiple()) {
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
          <div class="dropdown-items">
            @for (option of processedOptions(); track option.value) {
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
                    (click)="$event.stopPropagation()"
                  />
                }
                {{ option.label }}
              </div>
            }
            @if (processedOptions().length === 0) {
              <div class="dropdown-item disabled">No options available</div>
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
  
  // Modern signal-based outputs
  selectionChange = output<any>();
  
  // ViewChild as signal
  trigger = viewChild<ElementRef>('trigger');
  
  // Component state signals
  isOpen = signal(false);
  selectedValue = signal<any>(null);
  selectedLabel = signal<string>('');
  selectedItems = signal<DropdownOption[]>([]);
  
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
    
    if (this.multiple()) {
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