import { inject, Injectable, TemplateRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  router = inject(Router);
  modalEvent = new Subject<ModalData | null>();
  private confirmResolve?: (value: boolean) => void;

  constructor() {}
  open(title: string, body?: TemplateRef<any>, footer?: TemplateRef<any>, header?: TemplateRef<any>, size: ModalSize = 'medium') {
    this.modalEvent.next({
      title,
      bodyTemplate: body,
      footerTemplate: footer,
      headerTemplate: header,
      size: size,
    });
  }
  close() {
    this.modalEvent.next(null);
    if (this.confirmResolve) {
      this.confirmResolve(false);
      this.confirmResolve = undefined;
    }
  }
  
  confirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmResolve = resolve;
      this.modalEvent.next({
        title,
        message,
        isConfirm: true,
        onConfirm: () => {
          this.confirmResolve = undefined; // Clear to prevent close() from resolving
          this.modalEvent.next(null);
          resolve(true);
        },
        onCancel: () => {
          this.confirmResolve = undefined; // Clear to prevent close() from resolving
          this.modalEvent.next(null);
          resolve(false);
        }
      });
    });
  }
}

export type ModalSize = 'small' | 'medium' | 'large' | 'extra-large';

export interface ModalData {
  title: string;
  bodyTemplate?: TemplateRef<any>;
  footerTemplate?: TemplateRef<any>;
  headerTemplate?: TemplateRef<any>;
  message?: string;
  isConfirm?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  size?: ModalSize;
}