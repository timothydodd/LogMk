import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AgentSettingsComponent } from '../../_components/agent-settings/agent-settings.component';

@Component({
  selector: 'app-agents-page',
  standalone: true,
  imports: [AgentSettingsComponent],
  template: `
    <div class="agents-page">
      <div class="agents-header">
        <h1>Agents</h1>
        <button class="btn btn-secondary" (click)="back()">Back to Logs</button>
      </div>
      <div class="agents-content">
        <app-agent-settings></app-agent-settings>
      </div>
    </div>
  `,
  styleUrl: './agents-page.component.scss',
})
export class AgentsPageComponent {
  private router = inject(Router);

  back() {
    this.router.navigate(['/log']);
  }
}
