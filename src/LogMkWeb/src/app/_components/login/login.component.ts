import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbModal, NgbModalOptions, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { LucideAngularModule } from 'lucide-angular';
import { from } from 'rxjs';
import { AuthService } from '../../_services/auth-service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModule, LucideAngularModule],
  template: ` <form (submit)="login()">
    <div class="modal-header">
      <h5 class="modal-title">Login</h5>
      <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close" (click)="closeClick()"></button>
    </div>
    <div class="modal-body  d-flex flex-column gap20">
      <input type="email" class="form-control" [(ngModel)]="userName" placeholder="UserName" name="userName" required />
      <input
        type="password"
        class="form-control"
        [(ngModel)]="password"
        placeholder="Password"
        name="password"
        required
      />
    </div>
    <div class="modal-footer">
      <div>
        @if (errorMessage()) {
          <div class="text-danger">{{ errorMessage() }}</div>
        }
      </div>
      <button class="btn btn-primary" type="submit">Login</button>
    </div>
  </form>`,
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private authService = inject(AuthService);
  activeModal = inject(NgbActiveModal);

  userName: string = '';
  password: string = '';
  errorMessage = signal('');
  login() {
    this.authService.login(this.userName, this.password).subscribe({
      next: () => {
        this.activeModal.close();
      },
      error: (error) => {
        const message = error.status == 401 ? 'Invalid UserName or Password' : 'An error occurred';
        this.errorMessage.update(() => message);
      },
    });
  }
  closeClick() {
    this.activeModal.close();
  }
  static showModal(modalService: NgbModal) {
    const modalOption: NgbModalOptions = { backdrop: 'static', size: 'lg', centered: true };

    const modalRef = modalService.open(LoginComponent, modalOption);

    return from(modalRef.result as Promise<ReasonResponse>);
  }
}
export interface ReasonResponse {
  reasonText: string;
}
