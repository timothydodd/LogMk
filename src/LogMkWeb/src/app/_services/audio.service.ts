import { Injectable, signal } from '@angular/core';

export interface SoundAlert {
  enabled: boolean;
  errorSound: boolean;
  warningSound: boolean;
  volume: number; // 0-1
  soundType: 'beep' | 'chime' | 'notification';
}

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private readonly STORAGE_KEY = 'logmk-sound-alerts';

  // Default settings
  private defaultSettings: SoundAlert = {
    enabled: false,
    errorSound: true,
    warningSound: false,
    volume: 0.5,
    soundType: 'beep'
  };

  // Reactive settings signal
  soundSettings = signal<SoundAlert>(this.loadSettings());

  // Audio context for generating sounds
  private audioContext: AudioContext | null = null;

  constructor() {
    this.initializeAudioContext();
  }

  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Audio context not supported:', error);
    }
  }

  private loadSettings(): SoundAlert {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...this.defaultSettings, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load sound settings from localStorage:', error);
    }
    return this.defaultSettings;
  }

  private saveSettings(settings: SoundAlert): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save sound settings to localStorage:', error);
    }
  }

  updateSettings(settings: Partial<SoundAlert>): void {
    const currentSettings = this.soundSettings();
    const newSettings = { ...currentSettings, ...settings };
    this.soundSettings.set(newSettings);
    this.saveSettings(newSettings);
  }

  toggleEnabled(): void {
    const current = this.soundSettings();
    this.updateSettings({ enabled: !current.enabled });
  }

  /**
   * Play sound alert for log level
   */
  playAlert(logLevel: string): void {
    const settings = this.soundSettings();

    if (!settings.enabled || !this.audioContext) {
      return;
    }

    const normalizedLevel = logLevel.toLowerCase();

    // Check if we should play sound for this log level
    if ((normalizedLevel === 'error' && settings.errorSound) ||
        (normalizedLevel === 'warning' && settings.warningSound)) {
      this.playSound(settings.soundType, settings.volume);
    }
  }

  /**
   * Play a test sound
   */
  playTestSound(): void {
    const settings = this.soundSettings();
    if (this.audioContext) {
      this.playSound(settings.soundType, settings.volume);
    }
  }

  private playSound(soundType: string, volume: number): void {
    if (!this.audioContext) return;

    try {
      // Resume audio context if suspended (required by browsers)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Configure sound based on type
      switch (soundType) {
        case 'beep':
          this.createBeepSound(oscillator, gainNode, volume);
          break;
        case 'chime':
          this.createChimeSound(oscillator, gainNode, volume);
          break;
        case 'notification':
          this.createNotificationSound(oscillator, gainNode, volume);
          break;
        default:
          this.createBeepSound(oscillator, gainNode, volume);
      }

      oscillator.start();
    } catch (error) {
      console.warn('Failed to play sound:', error);
    }
  }

  private createBeepSound(oscillator: OscillatorNode, gainNode: GainNode, volume: number): void {
    oscillator.frequency.setValueAtTime(800, this.audioContext!.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.3, this.audioContext!.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext!.currentTime + 0.2);

    oscillator.stop(this.audioContext!.currentTime + 0.2);
  }

  private createChimeSound(oscillator: OscillatorNode, gainNode: GainNode, volume: number): void {
    oscillator.frequency.setValueAtTime(523.25, this.audioContext!.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, this.audioContext!.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, this.audioContext!.currentTime + 0.2); // G5
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.2, this.audioContext!.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext!.currentTime + 0.5);

    oscillator.stop(this.audioContext!.currentTime + 0.5);
  }

  private createNotificationSound(oscillator: OscillatorNode, gainNode: GainNode, volume: number): void {
    oscillator.frequency.setValueAtTime(440, this.audioContext!.currentTime); // A4
    oscillator.frequency.setValueAtTime(554.37, this.audioContext!.currentTime + 0.1); // C#5
    oscillator.type = 'triangle';

    gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.25, this.audioContext!.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(volume * 0.15, this.audioContext!.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext!.currentTime + 0.3);

    oscillator.stop(this.audioContext!.currentTime + 0.3);
  }
}