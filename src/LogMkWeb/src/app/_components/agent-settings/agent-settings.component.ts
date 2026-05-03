import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '@rd-ui';
import { firstValueFrom } from 'rxjs';
import { AgentApiService, AgentConfig, AgentInfo, AgentLogLevel } from '../../_services/agent.api';
import { TimestampService } from '../../_services/timestamp.service';

interface PodLevelEntry {
  pod: string;
  level: AgentLogLevel;
}

const LOG_LEVELS: AgentLogLevel[] = ['Any', 'Trace', 'Debug', 'Information', 'Warning', 'Error'];

@Component({
  selector: 'app-agent-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './agent-settings.component.html',
  styleUrl: './agent-settings.component.scss',
})
export class AgentSettingsComponent implements OnInit {
  private agentApi = inject(AgentApiService);
  private toast = inject(ToastService);
  private timestamps = inject(TimestampService);

  readonly logLevels = LOG_LEVELS;

  agents = signal<AgentInfo[]>([]);
  selectedAgentId = signal<string>('');
  config = signal<AgentConfig | null>(null);
  podLevelEntries = signal<PodLevelEntry[]>([]);
  ignoredPodsText = signal<string>('');

  isLoadingAgents = signal(false);
  isLoadingConfig = signal(false);
  isSaving = signal(false);

  newPod = signal<string>('');
  newPodLevel = signal<AgentLogLevel>('Information');

  selectedAgent = computed(() => this.agents().find((a) => a.agentId === this.selectedAgentId()) ?? null);

  async ngOnInit() {
    await this.loadAgents();
    if (this.agents().length > 0) {
      await this.selectAgent(this.agents()[0].agentId);
    }
  }

  async refresh() {
    await this.loadAgents();
    if (this.selectedAgentId()) {
      await this.loadConfig(this.selectedAgentId());
    }
  }

  async loadAgents() {
    try {
      this.isLoadingAgents.set(true);
      const agents = await firstValueFrom(this.agentApi.list());
      this.agents.set(agents);
    } catch (err) {
      console.error('Failed to load agents', err);
      this.toast.error('Failed to load agents');
    } finally {
      this.isLoadingAgents.set(false);
    }
  }

  async selectAgent(agentId: string) {
    this.selectedAgentId.set(agentId);
    await this.loadConfig(agentId);
  }

  async loadConfig(agentId: string) {
    try {
      this.isLoadingConfig.set(true);
      const cfg = await firstValueFrom(this.agentApi.getConfig(agentId));
      this.applyConfigToForm(cfg);
    } catch (err) {
      console.error('Failed to load agent config', err);
      this.toast.error('Failed to load agent config');
    } finally {
      this.isLoadingConfig.set(false);
    }
  }

  private applyConfigToForm(cfg: AgentConfig) {
    this.config.set({ ...cfg });
    const entries = Object.entries(cfg.podLogLevels ?? {})
      .map(([pod, level]) => ({ pod, level: level as AgentLogLevel }))
      .sort((a, b) => a.pod.localeCompare(b.pod));
    this.podLevelEntries.set(entries);
    this.ignoredPodsText.set((cfg.ignoredPods ?? []).join('\n'));
  }

  addPodOverride() {
    const pod = this.newPod().trim();
    if (!pod) return;
    const existing = this.podLevelEntries();
    if (existing.some((e) => e.pod === pod)) {
      this.toast.warning(`Override for "${pod}" already exists`);
      return;
    }
    this.podLevelEntries.set([...existing, { pod, level: this.newPodLevel() }]);
    this.newPod.set('');
  }

  removePodOverride(pod: string) {
    this.podLevelEntries.set(this.podLevelEntries().filter((e) => e.pod !== pod));
  }

  updatePodLevel(pod: string, level: AgentLogLevel) {
    this.podLevelEntries.set(this.podLevelEntries().map((e) => (e.pod === pod ? { ...e, level } : e)));
  }

  async save() {
    const cfg = this.config();
    const agentId = this.selectedAgentId();
    if (!cfg || !agentId) return;

    const podLogLevels: { [pod: string]: AgentLogLevel } = {};
    for (const entry of this.podLevelEntries()) {
      podLogLevels[entry.pod] = entry.level;
    }

    const ignoredPods = this.ignoredPodsText()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const payload: AgentConfig = {
      ...cfg,
      agentId,
      podLogLevels,
      ignoredPods,
    };

    try {
      this.isSaving.set(true);
      const saved = await firstValueFrom(this.agentApi.saveConfig(agentId, payload));
      this.applyConfigToForm(saved);
      this.toast.success('Agent config saved. Changes apply on the next config poll (~60s).');
    } catch (err: any) {
      console.error('Failed to save agent config', err);
      const msg = err?.error?.error ?? 'Failed to save agent config';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  formatRelative(value?: string | null): string {
    return this.timestamps.formatRelativeOnly(value);
  }

  formatAbsolute(value?: string | null): string {
    return this.timestamps.formatAbsoluteOnly(value);
  }
}
