import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GuildAnalysisMetadata } from './guild-analysis';

/**
 * The header of a guild's pages: realm, the guild's name in its faction's colour, what the page
 * shows, and a button to the guild's other page (statistics ⇄ PvE scores).
 */
@Component({
  selector: 'app-guild-page-hero',
  standalone: true,
  imports: [NgIf, RouterLink],
  template: `
    <header
      class="guild-page-hero"
      [class.guild-faction--alliance]="faction === 'Alliance'"
      [class.guild-faction--horde]="faction === 'Horde'">
      <p>{{ realm }} Realm</p>
      <div class="guild-title-row">
        <span aria-hidden="true"></span>
        <h1>{{ name }}</h1>
        <span aria-hidden="true"></span>
      </div>
      <strong>{{ subtitle }}</strong>
      <a *ngIf="link" class="hero-link" [routerLink]="link">
        <span *ngIf="back" aria-hidden="true">‹</span>
        {{ linkLabel }}
        <span *ngIf="!back" aria-hidden="true">›</span>
      </a>
    </header>
  `,
  styleUrl: './guild-page-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GuildPageHeroComponent {
  @Input({ required: true }) realm = '';
  @Input({ required: true }) name = '';
  @Input() faction?: GuildAnalysisMetadata['faction'];
  @Input({ required: true }) subtitle = '';
  /** Router commands for the button; no button without them. */
  @Input() link?: string[];
  @Input() linkLabel = '';
  /** A button back to the page this one came from: its arrow points left. */
  @Input() back = false;
}
