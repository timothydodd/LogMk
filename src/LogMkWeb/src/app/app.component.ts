import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SignalRService } from './_services/signalr.service';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'LogMkWeb';

  signalRService = inject(SignalRService)
  constructor(){
    this.signalRService.startConnection();
  }
}
