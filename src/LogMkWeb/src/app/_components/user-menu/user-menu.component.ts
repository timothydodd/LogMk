
import { ChangeDetectionStrategy, Component, inject, signal, TemplateRef, viewChild } from '@angular/core';

import { LucideAngularModule } from 'lucide-angular';
import { take } from 'rxjs';
import { AuthService, User } from '../../_services/auth-service';
import { ClickOutsideDirective } from '../../_services/click-outside.directive';
import { ModalService } from '../../_services/modal.service';
import { UserSettingsComponent } from '../user-settings/user-settings.component';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [LucideAngularModule, UserSettingsComponent, ClickOutsideDirective],
  template: `
    @if (user()) {
      <div class="user-menu-container">
        <button type="button" class="user-menu-trigger" (click)="isOpen.set(!isOpen())" title="User menu">
          <div class="user-avatar">
            <lucide-icon name="user" size="18"></lucide-icon>
          </div>
          <span class="user-name">{{ user()?.userName }}</span>
          <lucide-icon name="chevron-down" size="16" [class.rotated]="isOpen()"></lucide-icon>
        </button>
        
        @if (isOpen()) {
          <div class="user-menu-dropdown" appClickOutside (clickOutside)="isOpen.set(false)" [delayTime]="200">
            <div class="dropdown-header">
              <div class="user-info">
                <div class="large-avatar">
                  <lucide-icon name="user" size="24"></lucide-icon>
                </div>
                <div class="user-details">
                  <div class="username">{{ user()?.userName }}</div>
                  <div class="user-role">Administrator</div>
                </div>
              </div>
            </div>
            
            <div class="dropdown-divider"></div>
            
            <div class="dropdown-menu-items">
              <button class="dropdown-item" (click)="settings.show(); isOpen.set(false)">
                <lucide-icon name="settings" size="16"></lucide-icon>
                <span>Settings</span>
              </button>
              <button class="dropdown-item logout" (click)="logOut()">
                <lucide-icon name="log-out" size="16"></lucide-icon>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        }
      </div>

      <app-user-settings #settings></app-user-settings>
    }
  `,
  styleUrl: './user-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuComponent {
  authService = inject(AuthService);
  modalService = inject(ModalService);
  modalFooter = viewChild<TemplateRef<any>>('modalFooter');
  modalBody = viewChild<TemplateRef<any>>('modalBody');
  user = signal<User | null>(null);
  isOpen = signal(false);

  constructor() {
    this.authService
      .getUser()
      .pipe(take(1))
      .subscribe((user) => {
        this.user.update(() => user);
      });
  }
  logOut() {
    this.authService.logout();
  }
}
