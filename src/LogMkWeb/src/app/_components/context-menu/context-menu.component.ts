import { Component, input, output, signal, computed } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Log } from '../../_services/signalr.service';

export interface ContextMenuAction {
  label: string;
  icon: string;
  action: string;
  divider?: boolean;
}

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (isVisible()) {
      <div
        class="context-menu"
        [style.left.px]="position().x"
        [style.top.px]="position().y"
        (click)="$event.stopPropagation()">

        @for (action of actions(); track action.action) {
          @if (action.divider) {
            <div class="menu-divider"></div>
          }
          <button
            class="menu-item"
            (click)="onActionClick(action.action)">
            <lucide-icon [name]="action.icon" size="14"></lucide-icon>
            {{ action.label }}
          </button>
        }
      </div>
    }
  `,
  styleUrl: './context-menu.component.scss'
})
export class ContextMenuComponent {
  // State
  log = signal<Log | null>(null);
  isVisible = signal<boolean>(false);
  position = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  // Outputs
  actionSelected = output<{ action: string; log: Log }>();
  menuClosed = output<void>();

  // Available actions based on log context
  actions = computed(() => {
    const log = this.log();
    if (!log) return [];

    return [
      { label: 'Copy Log', icon: 'Copy', action: 'copy' },
      { label: 'View Details', icon: 'Info', action: 'details' },
      { label: '', icon: '', action: '', divider: true },
      { label: `Filter by "${log.logLevel}" Level`, icon: 'Filter', action: 'filter-level' },
      { label: `Filter by Pod "${log.pod}"`, icon: 'Box', action: 'filter-pod' },
      { label: '', icon: '', action: '', divider: true },
      { label: `Hide "${log.logLevel}" Logs`, icon: 'EyeOff', action: 'hide-level' },
      { label: `Hide Pod "${log.pod}"`, icon: 'EyeOff', action: 'hide-pod' }
    ] as ContextMenuAction[];
  });

  show(event: MouseEvent, log: Log) {
    // Prevent default context menu
    event.preventDefault();
    event.stopPropagation();

    // Set the log for context
    this.log.set(log);

    // Calculate position with viewport bounds checking
    const menuWidth = 220; // Approximate menu width
    const menuHeight = this.actions().filter(a => !a.divider).length * 36 +
                       this.actions().filter(a => a.divider).length * 9; // Approximate menu height

    let x = event.clientX;
    let y = event.clientY;

    // Adjust position if menu would go off screen
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }

    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    this.position.set({ x, y });
    this.isVisible.set(true);
  }

  hide() {
    this.isVisible.set(false);
    this.menuClosed.emit();
  }

  onActionClick(action: string) {
    const log = this.log();
    if (log && action) {
      this.actionSelected.emit({ action, log });
    }
    this.hide();
  }
}
