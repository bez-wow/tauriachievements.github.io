import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UpdateBarComponent } from './update-bar.component';

@Component({
  selector: 'app-support-page',
  standalone: true,
  imports: [UpdateBarComponent],
  templateUrl: './support-page.component.html',
  styleUrls: ['./support-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SupportPageComponent {}
