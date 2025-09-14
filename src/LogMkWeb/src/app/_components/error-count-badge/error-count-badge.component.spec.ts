import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ErrorCountBadgeComponent } from './error-count-badge.component';

describe('ErrorCountBadgeComponent', () => {
  let component: ErrorCountBadgeComponent;
  let fixture: ComponentFixture<ErrorCountBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorCountBadgeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ErrorCountBadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
