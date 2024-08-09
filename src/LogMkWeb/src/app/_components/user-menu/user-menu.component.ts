import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { LucideAngularModule } from 'lucide-angular';
import { take } from 'rxjs';
import { AuthService, User } from '../../_services/auth-service';
import { UserSettingsComponent } from '../user-settings/user-settings.component';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [CommonModule, NgbModule, LucideAngularModule, UserSettingsComponent],
  template: `
    @if (user()) {
      <div class="dropdown" ngbDropdown display="dynamic" #userMenu="ngbDropdown">
        <a class="dropdown-toggle" id="avatar-dd" ngbDropdownToggle>
          <div class="avatar-wrap">
            <div class="avatar" style="width: 40px">
              <lucide-icon name="user"></lucide-icon>
            </div>
          </div>
        </a>
        <div aria-labelledby="avatar-dd" class="user-menu" ngbDropdownMenu>
          <div class="mainMenu">
            <div class="user-menu-info">
              <div class="avatar-spacer">
                <div class="avatar-wrap">
                  <div class="avatar" style="width: 80px">
                    <lucide-icon name="user"></lucide-icon>
                  </div>
                </div>
              </div>
              <div class="basic-info">
                <div class="u-name">{{ user()?.userName }}</div>
              </div>
            </div>
          </div>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" (click)="Settings()">Settings</button>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" (click)="logOut()">LogOut</button>
        </div>
      </div>
    }
  `,
  styleUrl: './user-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuComponent {
  authService = inject(AuthService);
  modalService = inject(NgbModal);
  user = signal<User | null>(null);

  constructor() {
    this.authService
      .getUser()
      .pipe(take(1))
      .subscribe((user) => {
        this.user.update(() => user);
      });
  }
  Settings() {
    UserSettingsComponent.showModal(this.modalService);
  }
  logOut() {
    this.authService.logout();
  }
}
