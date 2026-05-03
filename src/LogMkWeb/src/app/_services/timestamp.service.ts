import { Injectable, signal } from '@angular/core';

export type TimestampFormat = 'relative' | 'absolute';

@Injectable({
  providedIn: 'root'
})
export class TimestampService {
  private readonly STORAGE_KEY = 'logmk_timestamp_format';

  // Signal to track current format preference
  timestampFormat = signal<TimestampFormat>(this.loadPreference());

  constructor() {
    // The signal will automatically trigger change detection
    // Preference saving is handled in toggleFormat method
  }

  /**
   * Toggle between relative and absolute timestamp formats
   */
  toggleFormat(): void {
    const current = this.timestampFormat();
    const newFormat: TimestampFormat = current === 'relative' ? 'absolute' : 'relative';
    this.timestampFormat.set(newFormat);
    this.savePreference(newFormat);
  }

  /**
   * Format a timestamp based on current preference
   */
  formatTimestamp(date: Date | string): string {
    const dateObj = this.parseServerDate(date);
    if (!dateObj) return '';
    const format = this.timestampFormat();

    if (format === 'relative') {
      return this.formatRelative(dateObj);
    } else {
      return this.formatAbsolute(dateObj);
    }
  }

  /**
   * Always-relative format (e.g. "5m ago"). Caller controls the format.
   */
  formatRelativeOnly(date: Date | string | null | undefined): string {
    const dateObj = this.parseServerDate(date);
    if (!dateObj) return 'never';
    return this.formatRelative(dateObj);
  }

  /**
   * Absolute timestamp in the user's local timezone (e.g. for a tooltip).
   */
  formatAbsoluteOnly(date: Date | string | null | undefined): string {
    const dateObj = this.parseServerDate(date);
    if (!dateObj) return '';
    return this.formatAbsolute(dateObj);
  }

  /**
   * Parse a server timestamp safely. The API stores everything in UTC but
   * occasionally serializes DateTime values without a 'Z' suffix when the
   * Kind tag was lost on a DB round-trip — JavaScript would otherwise treat
   * those as local time. We default missing-tz strings to UTC so the user's
   * browser then displays them in their own timezone correctly.
   */
  parseServerDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(value);
    const normalized = hasTz ? value : `${value}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Format timestamp as relative time (e.g., "5 min ago", "2 hours ago")
   */
  private formatRelative(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return diffSeconds <= 1 ? 'just now' : `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1 min ago' : `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours}h ago`;
    } else if (diffDays < 30) {
      return diffDays === 1 ? '1 day ago' : `${diffDays}d ago`;
    } else {
      // For very old entries, fall back to absolute format
      return this.formatAbsolute(date);
    }
  }

  /**
   * Format timestamp as absolute time (e.g., "Jan 14, 2025 2:30 PM")
   */
  private formatAbsolute(date: Date): string {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Load timestamp format preference from localStorage
   */
  private loadPreference(): TimestampFormat {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) as TimestampFormat;
      return saved === 'relative' || saved === 'absolute' ? saved : 'absolute';
    } catch {
      return 'absolute'; // Default fallback
    }
  }

  /**
   * Save timestamp format preference to localStorage
   */
  private savePreference(format: TimestampFormat): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, format);
    } catch {
      // Silently handle localStorage errors
    }
  }
}