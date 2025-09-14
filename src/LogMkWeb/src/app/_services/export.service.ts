import { Injectable } from '@angular/core';
import { Log } from './signalr.service';

@Injectable({
  providedIn: 'root'
})
export class ExportService {

  /**
   * Export logs to CSV format
   */
  exportToCSV(logs: Log[], filename: string = 'logs'): void {
    if (logs.length === 0) {
      return;
    }

    // CSV headers
    const headers = ['Timestamp', 'Pod', 'Log Level', 'Message'];

    // Convert logs to CSV rows
    const csvRows = logs.map(log => {
      const timestamp = new Date(log.timeStamp).toISOString();
      const pod = this.escapeCsvField(log.pod);
      const level = this.escapeCsvField(log.logLevel);
      const message = this.escapeCsvField(log.line);

      return [timestamp, pod, level, message].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...csvRows].join('\n');

    // Download file
    this.downloadFile(csvContent, `${filename}_${this.getTimestamp()}.csv`, 'text/csv');
  }

  /**
   * Export logs to JSON format
   */
  exportToJSON(logs: Log[], filename: string = 'logs'): void {
    if (logs.length === 0) {
      return;
    }

    // Create export object with metadata
    const exportData = {
      exportInfo: {
        timestamp: new Date().toISOString(),
        totalLogs: logs.length,
        dateRange: {
          from: logs.length > 0 ? new Date(Math.min(...logs.map(l => new Date(l.timeStamp).getTime()))).toISOString() : null,
          to: logs.length > 0 ? new Date(Math.max(...logs.map(l => new Date(l.timeStamp).getTime()))).toISOString() : null
        }
      },
      logs: logs.map(log => ({
        id: log.id,
        timestamp: log.timeStamp,
        pod: log.pod,
        logLevel: log.logLevel,
        message: log.line,
        view: log.view // Processed message for display
      }))
    };

    const jsonContent = JSON.stringify(exportData, null, 2);

    // Download file
    this.downloadFile(jsonContent, `${filename}_${this.getTimestamp()}.json`, 'application/json');
  }

  /**
   * Export logs with current filter information
   */
  exportFilteredLogs(logs: Log[], filters: {
    logLevels?: string[];
    pods?: string[];
    searchTerm?: string;
    timeRange?: { start: Date; end: Date } | null;
  }, format: 'csv' | 'json' = 'csv'): void {
    const filename = this.generateFilteredFilename(filters);

    if (format === 'csv') {
      this.exportToCSV(logs, filename);
    } else {
      this.exportToJSON(logs, filename);
    }
  }

  /**
   * Generate filename based on applied filters
   */
  private generateFilteredFilename(filters: {
    logLevels?: string[];
    pods?: string[];
    searchTerm?: string;
    timeRange?: { start: Date; end: Date } | null;
  }): string {
    let filename = 'logs';

    // Add log levels to filename
    if (filters.logLevels && filters.logLevels.length > 0) {
      filename += `_${filters.logLevels.join('-').toLowerCase()}`;
    }

    // Add pod names (truncate if too long)
    if (filters.pods && filters.pods.length > 0) {
      const podStr = filters.pods.length > 3
        ? `${filters.pods.slice(0, 2).join('-')}-and-${filters.pods.length - 2}-more`
        : filters.pods.join('-');
      filename += `_${podStr}`;
    }

    // Add search term (sanitized)
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchStr = filters.searchTerm.trim()
        .replace(/[^a-zA-Z0-9]/g, '-')
        .substring(0, 20);
      filename += `_search-${searchStr}`;
    }

    // Add date range
    if (filters.timeRange) {
      const startStr = filters.timeRange.start.toISOString().split('T')[0];
      const endStr = filters.timeRange.end.toISOString().split('T')[0];
      filename += `_${startStr}_to_${endStr}`;
    }

    return filename.replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
  }

  /**
   * Escape CSV field to handle commas, quotes, and newlines
   */
  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  /**
   * Generate timestamp for filename
   */
  private getTimestamp(): string {
    return new Date().toISOString()
      .replace(/[:.]/g, '-')
      .substring(0, 19);
  }

  /**
   * Download file to user's device
   */
  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up object URL
    window.URL.revokeObjectURL(url);
  }
}