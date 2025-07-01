import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimeFilterDropdownComponent } from './time-filter-dropdown.component';

describe('TimeFilterDropdownComponent', () => {
  let component: TimeFilterDropdownComponent;
  let fixture: ComponentFixture<TimeFilterDropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimeFilterDropdownComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimeFilterDropdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
