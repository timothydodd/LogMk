import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ValdemortModule } from 'ngx-valdemort';
@Component({
  selector: 'app-validation-defaults',
  templateUrl: './validation-defaults.component.html',
  styleUrls: ['./validation-defaults.component.scss'],
  standalone: true,
  imports: [CommonModule, ValdemortModule],
})
export class ValidationDefaultsComponent {}
