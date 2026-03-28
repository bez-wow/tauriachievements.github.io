import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-update-bar',
  templateUrl: './update-bar.component.html',
  styleUrls: ['./update-bar.component.scss'],
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpdateBarComponent {
  @Input() lastEdited?: Date;
  @Input() lastEditedTimeZoneLabel = 'Local time';
}
