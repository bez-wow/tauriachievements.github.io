import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { UpdateBarComponent } from './update-bar.component';
import { getGuildArmoryUrl } from '../utils/armory';

type BossKey = 'nythendra' | 'ursoc' | 'elerethe-renferal' | 'ilgynoth' |
  'dragons-of-nightmare' | 'cenarius' | 'xavius';
interface GuildKill {
  guild: string;
  realm?: string;
  date?: string;
  time?: string;
}

type EmeraldNightmareDataset = Partial<Record<BossKey, GuildKill[]>>;

interface BossView {
  key: BossKey;
  name: string;
  iconUrl: string;
  guilds: GuildKill[];
}

interface TimelineCheckpoint {
  boss: BossView;
  kill?: GuildKill;
  timestamp?: number;
  positionPercent?: number;
  splitMinutes?: number;
  isFirstKill: boolean;
  isVisible: boolean;
}

interface GuildTimeline {
  guild: string;
  color: string;
  completed: number;
  isLeader: boolean;
  totalMinutes?: number;
  progressStart?: number;
  progressWidth?: number;
  checkpoints: TimelineCheckpoint[];
}

const BOSS_DETAILS: ReadonlyArray<Omit<BossView, 'guilds'>> = [
  { key: 'nythendra', name: 'Nythendra', iconUrl: 'assets/emerald-nightmare/01-nythendra.png' },
  { key: 'ursoc', name: 'Ursoc', iconUrl: 'assets/emerald-nightmare/04-ursoc.png' },
  { key: 'dragons-of-nightmare', name: 'Dragons', iconUrl: 'assets/emerald-nightmare/05-dragons-of-nightmare.png' },
  { key: 'elerethe-renferal', name: 'Elerethe', iconUrl: 'assets/emerald-nightmare/03-elerethe.png' },
  { key: 'ilgynoth', name: "Il'gynoth", iconUrl: "assets/emerald-nightmare/02-il'gunoth.png" },
  { key: 'cenarius', name: 'Cenarius', iconUrl: 'assets/emerald-nightmare/06-cenarius.png' },
  { key: 'xavius', name: 'Xavius', iconUrl: 'assets/emerald-nightmare/07-xavious.png' }
];

const GUILD_COLORS = ['#ffb347', '#8ce6ff', '#d69cff', '#ff7897', '#91e58b', '#ffd86b', '#74a8ff'];
const TIMELINE_EXCLUDED_GUILDS = new Set(['cara máxima', 'nfa']);
const TIMELINE_DATE = '2026-09-23';
const TIMELINE_START_HOUR = 18;
const TIMELINE_END_HOUR = 22;
const TIMELINE_DURATION_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
const PLAYBACK_START_MINUTE = 10;
const THREE_MINUTE_PLAYBACK_START = 60;
const TIMELINE_HOUR_POSITIONS = [0, 25, 50, 75, 100] as const;
const TIMELINE_GUILD_REALMS: Readonly<Record<string, string>> = {
  'competence optional': 'Evermoon',
  miracle: 'Evermoon',
  endless: 'Evermoon',
  outlaws: 'Tauri',
  'cara máxima': 'Evermoon',
  nfa: 'Evermoon'
};

@Component({
  selector: 'app-emerald-nightmare-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent],
  templateUrl: './emerald-nightmare-page.component.html',
  styleUrls: ['./emerald-nightmare-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmeraldNightmarePageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly bosses = signal<BossView[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly playbackMinute = signal(TIMELINE_DURATION_MINUTES);
  readonly isPlaying = signal(false);
  readonly playbackTimeLabel = computed(() => {
    const totalMinutes = TIMELINE_START_HOUR * 60 + this.playbackMinute();
    return `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
  });
  readonly playbackButtonLabel = computed(() =>
    this.isPlaying() ? 'Pause' : this.playbackMinute() >= TIMELINE_DURATION_MINUTES ? 'Replay' : 'Play'
  );
  private playbackTimer?: ReturnType<typeof setInterval>;
  readonly timelineHours = [
    { label: '18:00', position: TIMELINE_HOUR_POSITIONS[0] },
    { label: '19:00', position: TIMELINE_HOUR_POSITIONS[1] },
    { label: '20:00', position: TIMELINE_HOUR_POSITIONS[2] },
    { label: '21:00', position: TIMELINE_HOUR_POSITIONS[3] },
    { label: '22:00', position: TIMELINE_HOUR_POSITIONS[4] }
  ];
  readonly guildTimelines = computed<GuildTimeline[]>(() => {
    const bosses = this.bosses();
    const playbackTimestamp = Date.parse(`${TIMELINE_DATE}T${TIMELINE_START_HOUR}:00:00+02:00`) +
      this.playbackMinute() * 60000;
    const guildNames = new Map<string, string>();

    bosses.forEach(boss => boss.guilds.forEach(kill => {
      if (kill.guild && kill.date === TIMELINE_DATE) {
        guildNames.set(kill.guild.toLocaleLowerCase(), kill.guild);
      }
    }));

    const timelines = Array.from(guildNames.values())
      .filter(guild => !TIMELINE_EXCLUDED_GUILDS.has(guild.toLocaleLowerCase()))
      .map((guild, index) => {
      let previousTimestamp: number | undefined;
      const checkpoints = bosses.map(boss => {
        const kill = boss.guilds.find(candidate =>
          candidate.date === TIMELINE_DATE &&
          candidate.guild.toLocaleLowerCase() === guild.toLocaleLowerCase());
        const timestamp = kill ? this.killTimestamp(kill) : undefined;
        const firstGuild = boss.guilds.find(candidate => candidate.guild)?.guild;
        const positionPercent = timestamp !== undefined ? this.timelinePosition(timestamp) : undefined;
        const isVisible = timestamp !== undefined && timestamp <= playbackTimestamp;
        const splitMinutes = timestamp !== undefined && previousTimestamp !== undefined
          ? Math.max(0, Math.round((timestamp - previousTimestamp) / 60000))
          : undefined;

        if (timestamp !== undefined) {
          previousTimestamp = timestamp;
        }

        return {
          boss,
          kill,
          timestamp,
          positionPercent,
          splitMinutes,
          isFirstKill: !!kill && firstGuild?.toLocaleLowerCase() === guild.toLocaleLowerCase(),
          isVisible
        };
      });
      const visibleCheckpoints = checkpoints.filter(checkpoint => checkpoint.isVisible);
      const completed = visibleCheckpoints.length;
      const positions = checkpoints
        .filter(checkpoint => checkpoint.isVisible)
        .map(checkpoint => checkpoint.positionPercent)
        .filter((position): position is number => position !== undefined);
      const progressStart = positions.length ? Math.min(...positions) : undefined;
      const progressEnd = positions.length ? Math.max(...positions) : undefined;
      const visibleTimestamps = visibleCheckpoints
        .map(checkpoint => checkpoint.timestamp)
        .filter((timestamp): timestamp is number => timestamp !== undefined);
      const visibleFirstTimestamp = visibleTimestamps.at(0);
      const visibleLastTimestamp = visibleTimestamps.at(-1);

      return {
        guild,
        color: GUILD_COLORS[index % GUILD_COLORS.length],
        completed,
        isLeader: false,
        totalMinutes: visibleFirstTimestamp !== undefined && visibleLastTimestamp !== undefined && completed > 1
          ? Math.round((visibleLastTimestamp - visibleFirstTimestamp) / 60000)
          : undefined,
        progressStart,
        progressWidth: progressStart !== undefined && progressEnd !== undefined
          ? Math.max(0, progressEnd - progressStart)
          : undefined,
        checkpoints
      };
    }).sort((left, right) => {
      const leftFinalKills = left.checkpoints.filter(checkpoint => checkpoint.kill).length;
      const rightFinalKills = right.checkpoints.filter(checkpoint => checkpoint.kill).length;
      const leftFinish = left.checkpoints.filter(checkpoint => checkpoint.kill).at(-1)?.timestamp;
      const rightFinish = right.checkpoints.filter(checkpoint => checkpoint.kill).at(-1)?.timestamp;
      return rightFinalKills - leftFinalKills ||
        (leftFinish ?? Number.MAX_SAFE_INTEGER) - (rightFinish ?? Number.MAX_SAFE_INTEGER) ||
        left.guild.localeCompare(right.guild);
    });

    const liveStandings = [...timelines].sort((left, right) => {
      const leftLatest = left.checkpoints.filter(checkpoint => checkpoint.isVisible).at(-1)?.timestamp;
      const rightLatest = right.checkpoints.filter(checkpoint => checkpoint.isVisible).at(-1)?.timestamp;
      return right.completed - left.completed ||
        (leftLatest ?? Number.MAX_SAFE_INTEGER) - (rightLatest ?? Number.MAX_SAFE_INTEGER) ||
        left.guild.localeCompare(right.guild);
    });
    const leaderGuild = liveStandings[0]?.completed ? liveStandings[0].guild : undefined;

    return timelines.map(timeline => ({
      ...timeline,
      isLeader: timeline.guild === leaderGuild
    }));
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stopPlayback());
    this.loadData();
  }

  retryLoad(): void {
    this.loadData();
  }

  togglePlayback(): void {
    if (this.isPlaying()) {
      this.stopPlayback();
      return;
    }

    if (this.playbackMinute() >= TIMELINE_DURATION_MINUTES) {
      this.playbackMinute.set(PLAYBACK_START_MINUTE);
    }

    this.isPlaying.set(true);
    this.playbackTimer = setInterval(() => {
      const currentMinute = this.playbackMinute();
      const nextMinute = currentMinute + (currentMinute >= THREE_MINUTE_PLAYBACK_START ? 3 : 1);
      if (nextMinute >= TIMELINE_DURATION_MINUTES) {
        this.playbackMinute.set(TIMELINE_DURATION_MINUTES);
        this.stopPlayback();
      } else {
        this.playbackMinute.set(nextMinute);
      }
    }, 200);
  }

  seekPlayback(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.playbackMinute.set(Math.min(TIMELINE_DURATION_MINUTES, Math.max(0, value)));
  }

  resetPlayback(): void {
    this.stopPlayback();
    this.playbackMinute.set(TIMELINE_DURATION_MINUTES);
  }

  trackBoss(index: number, boss: BossView): BossKey {
    return boss.key;
  }

  trackGuild(index: number): number {
    return index;
  }

  trackTimelineGuild(index: number, timeline: GuildTimeline): string {
    return timeline.guild;
  }

  trackCheckpoint(index: number, checkpoint: TimelineCheckpoint): BossKey {
    return checkpoint.boss.key;
  }

  guildArmoryUrl(guild: string): string {
    return getGuildArmoryUrl(guild, TIMELINE_GUILD_REALMS[guild.toLocaleLowerCase()] ?? 'Evermoon');
  }

  formatDuration(minutes: number | undefined): string {
    if (minutes === undefined) {
      return '';
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
  }

  formatSplitDuration(minutes: number | undefined): string {
    return minutes === undefined ? '' : `+${minutes} min`;
  }

  formatKillDate(date: string | undefined): string {
    if (!date) {
      return '';
    }

    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(parsed.getTime())
      ? date
      : new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(parsed);
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.http.get<EmeraldNightmareDataset>(`EmeraldNightmare.json?v=${Date.now()}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.bosses.set(BOSS_DETAILS.map(details => ({
            ...details,
            guilds: this.fiveSlots(data[details.key])
          })));
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Emerald Nightmare progression:', error);
          this.loadError.set('The Emerald Nightmare guild data could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  private stopPlayback(): void {
    if (this.playbackTimer !== undefined) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = undefined;
    }
    this.isPlaying.set(false);
  }

  private fiveSlots(guilds: GuildKill[] | undefined): GuildKill[] {
    return Array.from({ length: 5 }, (_, index) => {
      const kill = guilds?.[index];
      const realm = kill?.realm?.trim() || undefined;
      const rawDate = kill?.date?.trim() || undefined;
      const rawTime = kill?.time?.trim() || undefined;
      const legacyFields = realm && rawDate && !rawTime && this.looksLikeDate(realm) && this.looksLikeTime(rawDate);

      return {
        guild: kill?.guild?.trim() ?? '',
        realm: legacyFields ? undefined : realm,
        date: legacyFields ? this.normaliseDate(realm) : (rawDate ? this.normaliseDate(rawDate) : undefined),
        time: legacyFields ? rawDate : rawTime
      };
    });
  }

  private killTimestamp(kill: GuildKill): number | undefined {
    if (!kill.date || !kill.time) {
      return undefined;
    }

    const timestamp = Date.parse(`${this.normaliseDate(kill.date)}T${kill.time}:00+02:00`);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  private timelinePosition(timestamp: number): number {
    const start = Date.parse(`${TIMELINE_DATE}T${TIMELINE_START_HOUR.toString().padStart(2, '0')}:00:00+02:00`);
    const duration = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60 * 60 * 1000;
    return Math.min(100, Math.max(0, ((timestamp - start) / duration) * 100));
  }

  private looksLikeDate(value: string): boolean {
    return /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private looksLikeTime(value: string): boolean {
    return /^\d{1,2}:\d{2}$/.test(value);
  }

  private normaliseDate(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
    if (!match) {
      return value;
    }

    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[match[2].toLocaleLowerCase()];
    return month ? `${match[3]}-${month}-${match[1].padStart(2, '0')}` : value;
  }
}
