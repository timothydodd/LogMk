import { Injectable, TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ToolbarService {
  private toolbarContentSubject = new BehaviorSubject<TemplateRef<any> | null>(null);
  toolbarContent$ = this.toolbarContentSubject.asObservable();

  setToolbarContent(content: any) {
    this.toolbarContentSubject.next(content);
  }

  clearToolbarContent() {
    this.toolbarContentSubject.next(null);
  }
}
