import { Directive, ElementRef, HostListener, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appClickOutside]',
})
export class ClickOutsideDirective {
  private element = inject(ElementRef);

  clickOutside = output<void>();

  // ignore clicks for timeout in ms
  date = new Date();
  delayTime = input<number>(0);
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (new Date().getTime() - this.date.getTime() < this.delayTime()) return;

    var target = event.target as HTMLElement;
    if (!this.isInside(target)) {
      this.clickOutside.emit();
    } else {
      const isMenuItem = target.closest('[dropdown-item]') !== null;

      if (isMenuItem) {
        this.clickOutside.emit();
      }
    }
  }

  isInside(elementToCheck: HTMLElement) {
    return elementToCheck === this.element.nativeElement || this.element.nativeElement.contains(elementToCheck);
  }
}