import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { LoginComponent } from './_components/login/login.component';
import { UserMenuComponent } from './_components/user-menu/user-menu.component';
import { AuthService } from './_services/auth-service';
import { SignalRService } from './_services/signalr.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoginComponent, NgbModule, UserMenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'LogMkWeb';
  modalService = inject(NgbModal);
  private authService = inject(AuthService);
  signalRService = inject(SignalRService);
  loggedIn = signal(false);
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
  }
}
