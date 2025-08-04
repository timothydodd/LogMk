import { animate, state, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal, TemplateRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { ModalService } from '../../_services/modal.service';

@Component({
  selector: 'app-modal',
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (isOpen()) {
      <div class="backdrop" [@fadeInOut]></div>
      <div class="modal-container">
        <div class="modal" [@fadeInOut]>
          <div class="modal-header">
            @if (headerTemplate()) {
              <ng-container *ngTemplateOutlet="headerTemplate()!"></ng-container>
            } @else {
              <h4 class="modal-title">{{ title() }}</h4>
            }
            
            <button class="close" aria-label="Close" (click)="close(false)">
              <lucide-angular name="x"></lucide-angular>
            </button>
          </div>

          <div class="modal-body">
            @if (bodyTemplate()) {
              <ng-container *ngTemplateOutlet="bodyTemplate()!"> </ng-container>
            } @else if (isConfirm()) {
              <p>{{ message() }}</p>
            }
          </div>
          @if (footerTemplate()) {
            <div class="modal-footer">
              <ng-container *ngTemplateOutlet="footerTemplate()!"> </ng-container>
            </div>
          } @else if (isConfirm()) {
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="onCancel()">Cancel</button>
              <button type="button" class="btn btn-danger" (click)="onConfirm()">Confirm</button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styleUrl: './modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeInOut', [
      state(
        'void',
        style({
          opacity: 0,
        })
      ),
      transition('void <=> *', animate('300ms ease-in-out')),
    ]),
    trigger('fadeInMove', [
      state(
        'void',
        style({
          opacity: 0,
          transform: 'translateX(20px)',
        })
      ),
      transition('void <=> *', animate('300ms ease-in-out')),
    ]),
  ],
})
export class ModalComponent {
  modalService = inject(ModalService);
  footerTemplate = signal<TemplateRef<any> | null | undefined>(null);
  bodyTemplate = signal<TemplateRef<any> | null | undefined>(null);
  headerTemplate = signal<TemplateRef<any> | null | undefined>(null);
  isOpen = signal(false);
  title = signal<string | null>(null);
  message = signal<string | null>(null);
  isConfirm = signal(false);
  private confirmCallback?: () => void;
  private cancelCallback?: () => void;
  constructor() {
    this.modalService.modalEvent.pipe(takeUntilDestroyed()).subscribe((x) => {
      if (x && x !== null) {
        this.isOpen.set(true);
        this.bodyTemplate.set(x.bodyTemplate);
        this.footerTemplate.set(x.footerTemplate);
        this.headerTemplate.set(x.headerTemplate);
        this.title.set(x.title);
        this.message.set(x.message || null);
        this.isConfirm.set(x.isConfirm || false);
        this.confirmCallback = x.onConfirm;
        this.cancelCallback = x.onCancel;
        // Prevent background scrolling
        document.body.style.overflow = 'hidden';
      } else {
        this.isOpen.set(false);
        this.bodyTemplate.set(null);
        this.footerTemplate.set(null);
        this.headerTemplate.set(null);
        this.title.set(null);
        this.message.set(null);
        this.isConfirm.set(false);
        this.confirmCallback = undefined;
        this.cancelCallback = undefined;
        // Restore background scrolling
        document.body.style.overflow = '';
      }
    });
  }

  close(e: boolean) {
    this.modalService.modalEvent.next(null);
  }
  open() {
    this.isOpen.set(true);
  }
  
  onConfirm() {
    if (this.confirmCallback) {
      this.confirmCallback();
    }
  }
  
  onCancel() {
    if (this.cancelCallback) {
      this.cancelCallback();
    }
  }
}