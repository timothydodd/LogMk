import { CommonModule } from '@angular/common';
import { Component, inject, signal, TemplateRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { LoginComponent } from './_components/login/login.component';
import { UserMenuComponent } from './_components/user-menu/user-menu.component';
import { AuthService } from './_services/auth-service';
import { SignalRService } from './_services/signalr.service';
import { ToolbarService } from './_services/toolbar.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NgbModule, UserMenuComponent,CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'LogMkWeb';
  modalService = inject(NgbModal);
  private authService = inject(AuthService);
  signalRService = inject(SignalRService);
  loggedIn = signal(false);
  templateRef = signal<TemplateRef<any> | null>(null);
  toolbarService = inject(ToolbarService);
  constructor() {
    this.authService.isLoggedIn.subscribe((loggedIn) => {
      const token = this.authService.getToken();

      this.loggedIn.update(() => loggedIn && !!token);

      if (loggedIn && token) {
        this.signalRService.startConnection(token);
      } else {
        LoginComponent.showModal(this.modalService);
      }
    });
    this.toolbarService.toolbarContent$.pipe(takeUntilDestroyed()).subscribe((content) => {
      this.templateRef.set(content);
    });
  }
}
