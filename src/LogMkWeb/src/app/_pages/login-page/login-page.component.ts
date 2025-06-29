import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../_services/auth-service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-container">
      <div class="login-form">
        <div class="text-center mb-4">
          <img src="logmk.png" alt="LogMk" class="logo mb-3" />
          <h2 style="color: var(--on-surface); margin: 0;">Login to LogMk</h2>
        </div>
        
        <form (ngSubmit)="login()" #loginForm="ngForm">
          <div class="mb-3">
            <label for="username" class="form-label">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              class="form-control"
              [(ngModel)]="username"
              required
              autocomplete="username"
              #usernameInput="ngModel"
              placeholder="Enter your username"
            />
            @if (usernameInput.invalid && usernameInput.touched) {
              <div class="text-danger">Username is required</div>
            }
          </div>

          <div class="mb-3">
            <label for="password" class="form-label">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              class="form-control"
              [(ngModel)]="password"
              required
              autocomplete="current-password"
              #passwordInput="ngModel"
              placeholder="Enter your password"
            />
            @if (passwordInput.invalid && passwordInput.touched) {
              <div class="text-danger">Password is required</div>
            }
          </div>

          @if (error) {
            <div class="alert alert-danger" role="alert">
              {{ error }}
            </div>
          }

          <button
            type="submit"
            class="btn btn-primary w-100"
            [disabled]="loading || loginForm.invalid"
          >
            @if (loading) {
              <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Logging in...
            } @else {
              Login
            }
          </button>
        </form>
      </div>
    </div>
  `,
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  username = '';
  password = '';
  error = '';
  loading = false;
  returnUrl: string;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Get return url from route parameters or default to '/log'
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/log';

    // Redirect if already authenticated
    if (this.authService.isAuthenticated()) {
      this.router.navigate([this.returnUrl]);
    }
  }

  async login() {
    if (!this.username || !this.password) {
      this.error = 'Please enter username and password';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      await this.authService.login(this.username, this.password).toPromise();
      this.router.navigate([this.returnUrl]);
    } catch (error: any) {
      this.error = error.message || 'Invalid username or password';
      this.loading = false;
    }
  }
}