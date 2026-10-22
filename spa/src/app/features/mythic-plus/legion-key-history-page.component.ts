import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScrollRiseDirective } from '../../shared/motion/scroll-rise.directive';
import { SpotlightDirective } from '../../shared/motion/spotlight.directive';

export const LEGION_KEY_HISTORY_DOWNLOAD_URL =
  'https://github.com/bez-wow/legionkeyhistory/releases/latest/download/LegionKeyHistory.zip';

const REPO_URL = 'https://github.com/bez-wow/legionkeyhistory';

interface Screenshot {
  readonly label: string;
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

interface Feature {
  readonly title: string;
  readonly text: string;
}

const SCREENSHOTS: readonly Screenshot[] = [
  {
    label: 'Leaderboard',
    src: 'assets/legion-key-history/leaderboard.webp',
    alt: 'The in-game Mythic+ player leaderboard, with each player’s score and best key in every dungeon',
    width: 1216,
    height: 665
  },
  {
    label: 'Every run',
    src: 'assets/legion-key-history/runs.webp',
    alt: 'Every Mythic+ run ranked by score, with the dungeon, key level, time, affixes and group',
    width: 1221,
    height: 652
  },
  {
    label: 'Compare',
    src: 'assets/legion-key-history/compare.webp',
    alt: 'Two players compared side by side, dungeon by dungeon, with who leads and by how much',
    width: 1211,
    height: 628
  },
  {
    label: 'Player runs',
    src: 'assets/legion-key-history/player-runs.webp',
    alt: 'One player’s Mythic+ runs, newest first, with their score and rank',
    width: 1209,
    height: 586
  }
];

const FEATURES: readonly Feature[] = [
  {
    title: 'Scores on every player',
    text: 'See anyone’s score, rank and best keys in your friends list, the group finder and player tooltips.'
  },
  {
    title: 'The full leaderboard',
    text: 'Top players, every run, and separate tank, healer and DPS ladders, filtered by class and spec.'
  },
  {
    title: 'Compare players',
    text: 'Put up to five players side by side and see who is ahead in every dungeon.'
  },
  {
    title: 'Friends in keys, live',
    text: 'Friends and guildmates with the addon show the key they are in right now, with the timer, bosses and deaths.'
  },
  {
    title: 'Your group at a glance',
    text: 'Inside a dungeon, see every party member’s keystone, and everyone’s score and best keys side by side.'
  },
  {
    title: 'Your key journal',
    text: 'Every key you finish is saved with your group, affixes and time, along with your favourite dungeons and the people you play with most.'
  }
];

@Component({
  selector: 'app-legion-key-history-page',
  imports: [RouterLink, ScrollRiseDirective, SpotlightDirective, NgTemplateOutlet],
  templateUrl: './legion-key-history-page.component.html',
  styleUrls: ['./legion-key-history-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LegionKeyHistoryPageComponent {
  protected readonly downloadUrl = LEGION_KEY_HISTORY_DOWNLOAD_URL;
  protected readonly installGuideUrl = `${REPO_URL}#install`;
  protected readonly screenshots = SCREENSHOTS;
  protected readonly features = FEATURES;
  protected readonly shown = signal(SCREENSHOTS[0]);
}
