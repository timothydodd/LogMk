import { inject, Injectable, TemplateRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  router = inject(Router);
  modalEvent = new Subject<ModalData | null>();

  constructor() {}
  open(title: string, body?: TemplateRef<any>, footer?: TemplateRef<any>, header?: TemplateRef<any>) {
    this.modalEvent.next({
      title,
      bodyTemplate: body,
      footerTemplate: footer,
      headerTemplate: header,
    });
  }
  close() {
    this.modalEvent.next(null);
  }
}

export interface ModalData {
  title: string;
  bodyTemplate?: TemplateRef<any>;
  footerTemplate?: TemplateRef<any>;
  headerTemplate?: TemplateRef<any>;
}