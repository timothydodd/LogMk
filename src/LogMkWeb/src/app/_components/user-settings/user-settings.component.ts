import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalOptions, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { LucideAngularModule } from 'lucide-angular';
import { from } from 'rxjs';
import { ReasonResponse } from '../login/login.component';
import { ChangePasswordComponent } from './change-password/change-password.component';

@Component({
  selector: 'app-user-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule, LucideAngularModule, ChangePasswordComponent],
  template: ` <div class="modal-header">
      <h5 class="modal-title">Settings</h5>
      <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close" (click)="closeClick()"></button>
    </div>
    <div class="modal-body  d-flex flex-column gap20">
      <h5>Change Password</h5>
      @if (changePassword()) {
        <app-change-password (saveEvent)="changePassword.set(false)"></app-change-password>
      } @else {
        <button class="btn btn-primary" (click)="changePassword.set(true)">Change Password</button>
      }
    </div>
    <div class="modal-footer">
      <div>
        @if (errorMessage()) {
          <div class="text-danger">{{ errorMessage() }}</div>
        }
      </div>
    </div>`,
  styleUrl: './user-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSettingsComponent {
  activeModal = inject(NgbActiveModal);
  errorMessage = signal('');
  changePassword = signal(false);

  closeClick() {
    this.activeModal.close();
  }
  static showModal(modalService: NgbModal) {
    const modalOption: NgbModalOptions = { backdrop: 'static', size: 'lg', centered: true };

    const modalRef = modalService.open(UserSettingsComponent, modalOption);

    return from(modalRef.result as Promise<ReasonResponse>);
  }
}
