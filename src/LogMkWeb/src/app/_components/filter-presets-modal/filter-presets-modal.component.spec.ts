import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FilterPresetsModalComponent } from './filter-presets-modal.component';

describe('FilterPresetsModalComponent', () => {
  let component: FilterPresetsModalComponent;
  let fixture: ComponentFixture<FilterPresetsModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterPresetsModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FilterPresetsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
