import { Pipe, PipeTransform, inject } from '@angular/core';
import { TimestampService } from '../_services/timestamp.service';

@Pipe({
  name: 'timestampFormat',
  standalone: true,
  pure: false // Make it impure so it updates when the format preference changes
})
export class TimestampFormatPipe implements PipeTransform {
  private timestampService = inject(TimestampService);

  transform(value: Date | string | null | undefined): string {
    if (!value) return '';

    try {
      return this.timestampService.formatTimestamp(value);
    } catch (error) {
      // Fallback to default formatting if there's an error
      const date = typeof value === 'string' ? new Date(value) : value;
      return date.toLocaleString();
    }
  }
}