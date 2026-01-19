import { CommonModule } from '@angular/common';
import { Component, inject, signal, TemplateRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { ToastComponent } from '@rd-ui';
import { ErrorCountBadgeComponent } from './_components/error-count-badge/error-count-badge.component';
import { MobileMenuComponent } from './_components/mobile-menu/mobile-menu.component';
import { UserMenuComponent } from './_components/user-menu/user-menu.component';
import { AuthService } from './_services/auth-service';
import { SignalRService } from './_services/signalr.service';
import { ToolbarService } from './_services/toolbar.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UserMenuComponent, CommonModule, ErrorCountBadgeComponent, MobileMenuComponent, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'LogMkWeb';
  private authService = inject(AuthService);
  private router = inject(Router);
  signalRService = inject(SignalRService);
  loggedIn = signal(false);
  templateRef = signal<TemplateRef<any> | null>(null);
  toolbarService = inject(ToolbarService);
  constructor() {
    this.authService.isLoggedIn.pipe(takeUntilDestroyed()).subscribe((loggedIn) => {
      const token = this.authService.getToken();

      this.loggedIn.update(() => loggedIn && !!token);

      if (loggedIn && token) {
        this.signalRService.startConnection(token);
      } else {
        this.signalRService.disconnect(); // Ensure connection is cleaned up
        // Auth guard will handle redirecting to login page
      }
    });
    this.toolbarService.toolbarContent$.pipe(takeUntilDestroyed()).subscribe((content) => {
      this.templateRef.set(content);
    });
  }

  onErrorBadgeClick() {
    // Navigate to main page if needed
    if (this.router.url !== '/') {
      this.router.navigate(['/']);
    }

    // Emit event to filter state - we'll need to create a service for this
    // For now, just navigate to main page where error filtering can be handled
    const filterErrorsEvent = new CustomEvent('filterErrors', {
      detail: { logLevels: ['Error'] }
    });
    window.dispatchEvent(filterErrorsEvent);
  }

  onMobileMenuToggle(isOpen: boolean) {
    // Handle mobile menu state if needed
    // For now, this is just for future extensibility
  }
}
