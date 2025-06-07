
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ValdemortModule } from 'ngx-valdemort';
import { AuthService } from '../../../_services/auth-service';
import { ValidationDefaultsComponent } from '../../validation-defaults/validation-defaults.component';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, ValdemortModule, ValidationDefaultsComponent],
  template: `
    <div [formGroup]="form()" class="flex-column gap10">
      <div class="form-group">
        <label for="op">Old Password</label>
        <input formControlName="oldPassword" type="password" class="form-control" id="op" />
        <val-errors controlName="oldPassword" label="Old Password"></val-errors>
      </div>
      <div class="form-group">
        <label for="np">New Password</label>
        <input formControlName="newPassword" type="password" class="form-control" id="np" />
        <val-errors controlName="newPassword" label="New Password"></val-errors>
      </div>
      <div class="form-group">
        <label for="np2">Confirm New Password</label>
        <input formControlName="newPassword2" type="password" class="form-control" id="np2" />
        <val-errors controlName="newPassword2" label="Confirm New Password">
          <ng-template valError="noMatch">Password must match</ng-template>
        </val-errors>
      </div>
      <button class="btn btn-primary" (click)="submit()">Save</button>
      @if (errorMessage()) {
        <div class="text-danger">{{ errorMessage() }}</div>
      }
    </div>
    <app-validation-defaults> </app-validation-defaults>
  `,
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  errorMessage = signal('');
  form = signal<FormGroup<ChangePasswordForm>>(
    new FormGroup(
      {
        oldPassword: new FormControl<string>('', [Validators.required]),
        newPassword: new FormControl<string>('', [Validators.required]),
        newPassword2: new FormControl<string>('', [Validators.required]),
      },
      [fieldsMatchValidator('newPassword', 'newPassword2')]
    )
  );
  saveEvent = output();
  submit() {
    const form = this.form();

    if (!form.valid) {
      form.markAllAsTouched();
      form.updateValueAndValidity();
      this.errorMessage.set('Please correct the errors');
      return;
    }
    this.authService
      .changePassword({
        oldPassword: form.value.oldPassword ?? '',
        newPassword: form.value.newPassword ?? '',
      })
      .subscribe({
        next: () => {
          this.toastr.success('Password changed');
          this.saveEvent.emit();
        },
        error: (error) => {
          this.toastr.error('Password changed Failed');
          const message = error.status == 401 ? 'Invalid UserName or Password' : 'An error occurred';
          this.errorMessage.update(() => message);
        },
      });
  }
}

export interface ChangePasswordForm {
  oldPassword: FormControl<string | null>;
  newPassword: FormControl<string | null>;
  newPassword2: FormControl<string | null>;
}

export function fieldsMatchValidator(controlName: string, matchingControlName: string): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const formGroup = c as FormGroup;
    const control = formGroup.controls[controlName];
    const matchingControl = formGroup.controls[matchingControlName];

    if (matchingControl.errors && !matchingControl.errors['noMatch']) {
      // return if another validator has already found an error on the matchingControl
      return null;
    }

    // set error on matchingControl if validation fails
    if (control.value !== matchingControl.value) {
      matchingControl.setErrors({ noMatch: true });
    } else {
      matchingControl.setErrors(null);
    }

    return null;
  };
}
