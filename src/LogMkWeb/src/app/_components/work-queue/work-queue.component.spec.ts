import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkQueueComponent } from './work-queue.component';

describe('WorkQueueComponent', () => {
  let component: WorkQueueComponent;
  let fixture: ComponentFixture<WorkQueueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkQueueComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
