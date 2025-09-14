import { Component, inject, signal, computed, TemplateRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilterPresetsService, FilterPreset } from '../../_services/filter-presets.service';
import { LogFilterState } from '../../_pages/main-log-page/_services/log-filter-state';
import { ModalService } from '../../_services/modal.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-filter-presets-modal',
  standalone: true,
  imports: [LucideAngularModule, FormsModule],
  template: `
    <!-- Body Template -->
    <ng-template #bodyTemplate>
      <div class="presets-content">
        <!-- Save Current Filters Section -->
        <div class="save-section">
          <h4>Save Current Filters</h4>
          <div class="form-group">
            <input
              type="text"
              placeholder="Preset name (e.g., 'Error Investigation')"
              [(ngModel)]="newPresetName"
              class="form-control"
              maxlength="50"
            />
          </div>
          <div class="form-group">
            <textarea
              placeholder="Optional description..."
              [(ngModel)]="newPresetDescription"
              class="form-control"
              rows="2"
              maxlength="200"
            ></textarea>
          </div>
          <button
            class="btn btn-primary"
            [disabled]="!canSavePreset()"
            (click)="saveCurrentPreset()">
            <lucide-icon name="Save" size="16"></lucide-icon>
            Save Preset
          </button>
        </div>

        <!-- Divider -->
        <hr class="section-divider">

        <!-- Existing Presets Section -->
        <div class="presets-section">
          <h4>Saved Presets</h4>

          @if (!presetsService.hasPresets()) {
            <div class="empty-state">
              <lucide-icon name="Bookmark" size="48" class="empty-icon"></lucide-icon>
              <p>No saved presets yet</p>
              <p class="text-muted">Save your current filter settings above to create your first preset.</p>
            </div>
          } @else {
            <div class="presets-list">
              @for (preset of presetsService.presets(); track preset.id) {
                <div class="preset-item">
                  <div class="preset-main">
                    <div class="preset-info">
                      <h5 class="preset-name">{{ preset.name }}</h5>
                      @if (preset.description) {
                        <p class="preset-description">{{ preset.description }}</p>
                      }
                      <div class="preset-filters">
                        @if (preset.logLevels) {
                          <span class="filter-tag">Levels: {{ preset.logLevels.join(', ') }}</span>
                        }
                        @if (preset.pods) {
                          <span class="filter-tag">Pods: {{ preset.pods.length }} selected</span>
                        }
                        @if (preset.searchString) {
                          <span class="filter-tag">Search: "{{ preset.searchString }}"</span>
                        }
                        @if (preset.timeRange || preset.customTimeRange) {
                          <span class="filter-tag">Time Range: Custom</span>
                        }
                      </div>
                      <small class="preset-date">
                        Created: {{ formatDate(preset.createdAt) }}
                      </small>
                    </div>
                    <div class="preset-actions">
                      <button
                        class="btn btn-sm btn-outline-primary"
                        (click)="applyPreset(preset)"
                        title="Apply this preset">
                        <lucide-icon name="Play" size="14"></lucide-icon>
                        Apply
                      </button>
                      <button
                        class="btn btn-sm btn-outline-danger"
                        (click)="deletePreset(preset.id)"
                        title="Delete this preset">
                        <lucide-icon name="Trash2" size="14"></lucide-icon>
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </ng-template>

    <!-- Footer Template -->
    <ng-template #footerTemplate>
      <button
        type="button"
        class="btn btn-secondary"
        (click)="close()">
        Close
      </button>
    </ng-template>
  `,
  styleUrl: './filter-presets-modal.component.scss'
})
export class FilterPresetsModalComponent {
  presetsService = inject(FilterPresetsService);
  logFilterState = inject(LogFilterState);
  modalService = inject(ModalService);

  bodyTemplate = viewChild<TemplateRef<any>>('bodyTemplate');
  footerTemplate = viewChild<TemplateRef<any>>('footerTemplate');

  newPresetName = signal('');
  newPresetDescription = signal('');

  canSavePreset = computed(() => {
    const name = this.newPresetName().trim();
    return name.length > 0 && name.length <= 50;
  });

  open() {
    this.newPresetName.set('');
    this.newPresetDescription.set('');

    const body = this.bodyTemplate();
    const footer = this.footerTemplate();

    this.modalService.open('Filter Presets', body, footer, undefined, 'large');
  }

  close() {
    this.modalService.close();
  }

  saveCurrentPreset() {
    if (!this.canSavePreset()) return;

    const currentFilters = {
      logLevels: this.logFilterState.selectedLogLevel(),
      pods: this.logFilterState.selectedPod(),
      searchString: this.logFilterState.searchString(),
      timeRange: this.logFilterState.selectedTimeRange(),
      customTimeRange: this.logFilterState.customTimeRange()
    };

    this.presetsService.saveCurrentFilters(
      this.newPresetName(),
      this.newPresetDescription() || undefined,
      currentFilters
    );

    // Reset form
    this.newPresetName.set('');
    this.newPresetDescription.set('');
  }

  applyPreset(preset: FilterPreset) {
    // Apply all filter settings
    this.logFilterState.selectedLogLevel.set(preset.logLevels);
    this.logFilterState.selectedPod.set(preset.pods);
    this.logFilterState.searchString.set(preset.searchString);
    this.logFilterState.selectedTimeRange.set(preset.timeRange);
    this.logFilterState.customTimeRange.set(preset.customTimeRange);

    this.close();
  }

  deletePreset(id: string) {
    if (confirm('Are you sure you want to delete this preset? This action cannot be undone.')) {
      this.presetsService.deletePreset(id);
    }
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
}
