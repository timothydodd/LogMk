
import { ChangeDetectionStrategy, Component, inject, signal, TemplateRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../_services/auth-service';
import { ModalService } from '../../_services/modal.service';
import { ChangePasswordComponent } from './change-password/change-password.component';

@Component({
  selector: 'app-user-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ChangePasswordComponent],
  template: `
    <ng-template #modalHeader>
      <div class="settings-header">
        <h3 class="settings-title">User Settings</h3>
        <p class="settings-subtitle">Manage your account and system settings</p>
      </div>
    </ng-template>

    <ng-template #modalBody>
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
    </ng-template>
    
    <ng-template #modalFooter>
      <div>
        @if (errorMessage()) {
          <div class="text-danger">{{ errorMessage() }}</div>
        }
      </div>
    </ng-template>`,
  styleUrl: './user-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSettingsComponent {
  modalService = inject(ModalService);
  authService = inject(AuthService);
  modalFooter = viewChild<TemplateRef<any>>('modalFooter');
  modalBody = viewChild<TemplateRef<any>>('modalBody');
  modalHeader = viewChild<TemplateRef<any>>('modalHeader');
  errorMessage = signal('');
  changePassword = signal(false);
  activeTab = signal<'account' | 'users'>('account');

  show() {
    this.modalService.open('User Settings', this.modalBody(), this.modalFooter(), this.modalHeader());
  }

  setActiveTab(tab: 'account' | 'users') {
    this.activeTab.set(tab);
  }

  isAdmin(): boolean {
    return true;
  }
}
