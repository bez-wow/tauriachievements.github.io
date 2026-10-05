import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { UpdateBarComponent } from './update-bar.component';

/**
 * Explains the /mythic-plus scores: run score on the left, player score on the right.
 * The formula lives in api/MythicPlusExporter/MythicPlusScore.cs, and every worked example
 * on this page is pinned by a test there, so keep the two in step.
 */
@Component({
  selector: 'app-mythic-plus-scoring-page',
  standalone: true,
  imports: [RouterLink, UpdateBarComponent, BackToTopButtonComponent],
  templateUrl: './mythic-plus-scoring-page.component.html',
  styleUrl: './mythic-plus-scoring-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusScoringPageComponent {}
