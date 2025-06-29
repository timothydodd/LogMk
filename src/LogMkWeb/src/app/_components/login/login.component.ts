
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../_services/auth-service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
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

  userName: string = '';
  password: string = '';
  errorMessage = signal('');
  
  login() {
    this.authService.login(this.userName, this.password).subscribe({
      next: () => {
        // This component is deprecated - use login-page instead
      },
      error: (error) => {
        const message = error.status == 401 ? 'Invalid UserName or Password' : 'An error occurred';
        this.errorMessage.update(() => message);
      },
    });
  }
  
  closeClick() {
    // This component is deprecated - use login-page instead
  }
}
export interface ReasonResponse {
  reasonText: string;
}
