import { CommonModule } from '@angular/common';
import { Component, inject, signal, TemplateRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { ModalComponent } from './_components/modal/modal.component';
import { UserMenuComponent } from './_components/user-menu/user-menu.component';
import { AuthService } from './_services/auth-service';
import { SignalRService } from './_services/signalr.service';
import { ToolbarService } from './_services/toolbar.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UserMenuComponent, CommonModule, ModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'LogMkWeb';
  private authService = inject(AuthService);
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
}
