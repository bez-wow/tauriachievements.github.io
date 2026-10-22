import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-mythic-plus-scoring-page',
  imports: [RouterLink],
  templateUrl: './mythic-plus-scoring-page.component.html',
  styleUrl: './mythic-plus-scoring-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusScoringPageComponent {}
