
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
import { ToastService } from '@rd-ui';
import { AuthService } from '../../../_services/auth-service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule],
  template: `
    <div [formGroup]="form()" class="flex-column gap10">
      <div class="form-group">
        <label for="op">Old Password</label>
        <input formControlName="oldPassword" type="password" class="form-control" id="op" />
        @if (form().get('oldPassword')?.invalid && form().get('oldPassword')?.touched) {
          <div class="text-danger">Old Password is required</div>
        }
      </div>
      <div class="form-group">
        <label for="np">New Password</label>
        <input formControlName="newPassword" type="password" class="form-control" id="np" />
        @if (form().get('newPassword')?.invalid && form().get('newPassword')?.touched) {
          <div class="text-danger">New Password is required</div>
        }
      </div>
      <div class="form-group">
        <label for="np2">Confirm New Password</label>
        <input formControlName="newPassword2" type="password" class="form-control" id="np2" />
        @if (form().get('newPassword2')?.invalid && form().get('newPassword2')?.touched) {
          <div class="text-danger">
            @if (form().get('newPassword2')?.errors?.['required']) {
              Confirm New Password is required
            }
            @if (form().get('newPassword2')?.errors?.['noMatch']) {
              Password must match
            }
          </div>
        }
      </div>
      <button class="btn btn-primary" (click)="submit()">Save</button>
      @if (errorMessage()) {
        <div class="text-danger">{{ errorMessage() }}</div>
      }
    </div>
  `,
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  private authService = inject(AuthService);
  private toast = inject(ToastService);
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
          this.toast.success('Password changed');
          this.saveEvent.emit();
        },
        error: (error) => {
          this.toast.error('Password change failed');
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
