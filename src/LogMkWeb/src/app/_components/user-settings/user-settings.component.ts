
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ModalContainerService, ModalLayoutComponent } from '@rd-ui';
import { AuthService } from '../../_services/auth-service';
import { ChangePasswordComponent } from './change-password/change-password.component';

@Component({
  selector: 'app-user-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ChangePasswordComponent, ModalLayoutComponent],
  template: `
    <rd-modal-layout>
      <div slot="header" class="settings-header">
        <h3 class="settings-title">User Settings</h3>
        <p class="settings-subtitle">Manage your account and system settings</p>
      </div>

      <div slot="body">
        <div class="user-settings-container">
          <!-- Sub Header with Navigation Tabs -->
          <div class="settings-subheader">
            <div class="settings-nav">
              <button
                class="nav-tab"
                [class.active]="activeTab() === 'account'"
                (click)="setActiveTab('account')">
                Account
              </button>
              @if (isAdmin()) {
                <button
                  class="nav-tab"
                  [class.active]="activeTab() === 'users'"
                  (click)="setActiveTab('users')">
                  Manage Users
                </button>
              }
            </div>
          </div>

          <!-- Content Sections -->
          <div class="settings-content">
            @if (activeTab() === 'account') {
              <div class="account-section">
                <h4>Change Password</h4>
                @if (changePassword()) {
                  <app-change-password (saveEvent)="changePassword.set(false)"></app-change-password>
                } @else {
                  <button class="btn btn-primary" (click)="changePassword.set(true)">Change Password</button>
                }
              </div>
            }
          </div>
        </div>
      </div>

      <div slot="footer">
        @if (errorMessage()) {
          <div class="text-danger">{{ errorMessage() }}</div>
        }
      </div>
    </rd-modal-layout>`,
  styleUrl: './user-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSettingsComponent {
  modalContainerService = inject(ModalContainerService);
  authService = inject(AuthService);
  errorMessage = signal('');
  changePassword = signal(false);
  activeTab = signal<'account' | 'users'>('account');

  setActiveTab(tab: 'account' | 'users') {
    this.activeTab.set(tab);
  }

  isAdmin(): boolean {
    return true;
  }
}
