import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ValidationDefaultsComponent } from './validation-defaults.component';

describe('ValidationBoxComponent', () => {
  let component: ValidationDefaultsComponent;
  let fixture: ComponentFixture<ValidationDefaultsComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ValidationDefaultsComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ValidationDefaultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
