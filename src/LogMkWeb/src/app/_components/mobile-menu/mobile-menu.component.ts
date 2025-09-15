import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal, TemplateRef } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { take } from 'rxjs';
import { AuthService, User } from '../../_services/auth-service';
import { ClickOutsideDirective } from '../../_services/click-outside.directive';

@Component({
  selector: 'app-mobile-menu',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ClickOutsideDirective],
  template: `
    <div class="mobile-menu-container">
      <!-- Hamburger Button -->
      <button
        type="button"
        class="hamburger-btn"
        (click)="isOpen.set(!isOpen())"
        [class.active]="isOpen()"
        aria-label="Toggle menu">
        <div class="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>

      <!-- Mobile Menu Overlay -->
      @if (isOpen()) {
        <div class="mobile-menu-overlay" (click)="isOpen.set(false)"></div>

        <!-- Mobile Menu Panel -->
        <div class="mobile-menu-panel" appClickOutside (clickOutside)="isOpen.set(false)" [delayTime]="200">
          <!-- Main Menu Options -->
          <div class="menu-section main-menu">
            <!-- User Info Header -->
            @if (user()) {
              <div class="user-info-header">
                <div class="user-avatar">
                  <lucide-icon name="user" size="20"></lucide-icon>
                </div>
                <div class="user-details">
                  <div class="username">{{ user()?.userName }}</div>
                  <div class="user-role">Administrator</div>
                </div>
              </div>
            }

            <!-- Menu Options List -->
            <div class="menu-options">
              <button class="menu-option" (click)="navigateToSettings()">
                <lucide-icon name="settings" size="18"></lucide-icon>
                <span>Settings</span>
                <lucide-icon name="chevron-down" size="14" class="chevron"></lucide-icon>
              </button>

              <button class="menu-option logout" (click)="logOut()">
                <lucide-icon name="log-out" size="18"></lucide-icon>
                <span>Sign Out</span>
                <lucide-icon name="chevron-down" size="14" class="chevron"></lucide-icon>
              </button>
            </div>
          </div>

          <!-- Divider -->
          <div class="menu-divider"></div>

          <!-- Filters Section -->
          @if (filtersTemplate()) {
            <div class="menu-section filters-section">
              <div class="section-header">
                <lucide-icon name="filter" size="16"></lucide-icon>
                <span>Filters</span>
              </div>
              <div class="filters-content">
                <ng-container [ngTemplateOutlet]="filtersTemplate()"></ng-container>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './mobile-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileMenuComponent {
  // Inputs
  filtersTemplate = input<TemplateRef<any> | null>(null);

  // Outputs
  menuToggle = output<boolean>();

  // Services
  private authService = inject(AuthService);
  private router = inject(Router);

  // State
  isOpen = signal(false);
  user = signal<User | null>(null);

  constructor() {
    this.authService
      .getUser()
      .pipe(take(1))
      .subscribe((user) => {
        this.user.set(user);
      });
  }

  navigateToSettings() {
    this.isOpen.set(false);
    this.router.navigate(['/settings']);
    this.menuToggle.emit(false);
  }

  logOut() {
    this.isOpen.set(false);
    this.authService.logout();
    this.menuToggle.emit(false);
  }
}