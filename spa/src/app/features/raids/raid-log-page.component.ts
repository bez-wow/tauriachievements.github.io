import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { getClassIconPath } from '../../game/classIconHelper';
import { getClassColor } from '../../game/class-colors';
import { GlideDirective } from '../../shared/motion/glide.directive';
import {
  ITEM_QUALITY_COLORS,
  ROLE_NAMES,
  formatAmount,
  formatFightTime,
  formatPerSecond,
  itemIconUrl,
  itemUrl,
  raidBossLink,
  raidCharacterLink,
  raidGuildLink
} from './raid-display';
import { RaidItem, RaidKill, RaidKillDetails, RaidLogsIndex, RaidMember } from './raid-logs.types';
import { characterKey } from './raid-logs';
import { speedRank } from './raid-progression';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { RaidLogsDataService } from './raid-logs-data.service';
import { Role } from '../../game/wow';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';

type LogMetric = 'damage' | 'healing' | 'taken';

const METRICS: ReadonlyArray<{ id: LogMetric; label: string }> = [
  { id: 'damage', label: 'Damage' },
  { id: 'healing', label: 'Healing' },
  { id: 'taken', label: 'Damage taken' }
];

const ROLE_ORDER: ReadonlyArray<Role> = ['tank', 'healer', 'dps'];

interface MemberRow {
  member: RaidMember;
  amount: number;
  perSecond: number;
  share: number;
  bar: number;
}

interface LootView {
  id: number;
  item?: RaidItem;
  color: string;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

@Component({
  selector: 'app-raid-log-page',
  imports: [RouterLink, GlideDirective, RevealDirective, DatePipe, DecimalPipe, LoadStateComponent],
  templateUrl: './raid-log-page.component.html',
  styleUrl: './raid-log-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogPageComponent {
  readonly characterKey = characterKey;

  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  readonly metrics = METRICS;
  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly kill = signal<RaidKillDetails | undefined>(undefined);
  private readonly siblings = signal<RaidKill[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly metric = signal<LogMetric>('damage');
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  readonly rows = computed<MemberRow[]>(() => {
    const kill = this.kill();
    if (!kill) {
      return [];
    }

    const metric = this.metric();
    const seconds = kill.fightMs / 1000;
    const amounts = kill.members.map(member => ({ member, amount: amountOf(member, metric) }));
    const total = amounts.reduce((sum, entry) => sum + entry.amount, 0);
    const top = Math.max(1, ...amounts.map(entry => entry.amount));
    return amounts
      .sort((a, b) => b.amount - a.amount || a.member.character.name.localeCompare(b.member.character.name))
      .map(({ member, amount }) => ({
        member,
        amount,
        perSecond: seconds > 0 ? amount / seconds : 0,
        share: total > 0 ? (amount / total) * 100 : 0,
        bar: (amount / top) * 100
      }));
  });

  readonly composition = computed(() => {
    const members = this.kill()?.members ?? [];
    return ROLE_ORDER.map(role => ({
      role,
      label: ROLE_NAMES[role],
      count: members.filter(member => member.spec?.role === role).length
    }));
  });

  readonly summary = computed<SummaryTile[]>(() => {
    const kill = this.kill();
    if (!kill) {
      return [];
    }

    const seconds = kill.fightMs / 1000;
    const damage = kill.members.reduce((sum, member) => sum + member.damage, 0);
    const healing = kill.members.reduce((sum, member) => sum + member.healing + member.absorbs, 0);
    const rank = speedRank(kill, this.siblings());
    return [
      {
        label: 'Fight time',
        value: formatFightTime(kill.fightMs),
        note: rank ? `#${rank} fastest of ${this.siblings().length.toLocaleString('en-US')}` : ''
      },
      { label: 'Raid DPS', value: formatPerSecond(seconds ? damage / seconds : 0), note: `${formatAmount(damage)} damage` },
      { label: 'Raid HPS', value: formatPerSecond(seconds ? healing / seconds : 0), note: `${formatAmount(healing)} healing` },
      { label: 'Deaths', value: String(kill.deaths), note: `${kill.resurrects} battle res${kill.resurrects === 1 ? '' : 'es'}` },
      { label: 'Wipes before', value: String(kill.wipes), note: `${kill.members.length} players` }
    ];
  });

  readonly loot = computed<LootView[]>(() => {
    const items = this.index()?.items;
    return (this.kill()?.items ?? []).map(id => {
      const item = items?.get(id);
      return { id, item, color: ITEM_QUALITY_COLORS[item?.quality ?? 1] ?? '#fff' };
    });
  });

  readonly bossLink = raidBossLink;
  readonly guildLink = raidGuildLink;
  readonly characterLink = raidCharacterLink;
  readonly classIcon = getClassIconPath;
  readonly formatAmount = formatAmount;
  readonly formatPerSecond = formatPerSecond;
  readonly itemIcon = itemIconUrl;
  readonly itemUrl = itemUrl;

  private subscription?: Subscription;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params.get('realm') ?? '', Number(params.get('id'))));
    });
  }

  reload(): void {
    const params = this.params();
    this.load(params.get('realm') ?? '', Number(params.get('id')));
  }

  setMetric(metric: LogMetric): void {
    this.metric.set(metric);
  }

  classColor(classId: number): string {
    return getClassColor(classId) ?? '#e0e0e0';
  }

  private load(realm: string, logId: number): void {
    this.subscription?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set(undefined);

    if (!Number.isInteger(logId) || logId <= 0) {
      this.loadError.set('That is not a raid log.');
      this.isLoading.set(false);
      return;
    }

    this.subscription = this.data.findKill(realm, logId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: found => {
          this.index.set(found.index);
          this.kill.set(found.details);
          this.siblings.set(found.kill
            ? found.index.kills.filter(kill => kill.boss === found.kill!.boss && kill.difficulty === found.kill!.difficulty)
            : []);
          if (!found.details) {
            this.loadError.set('This log is not in the raid logs. It may be from another raid, or too new to be listed yet.');
          }
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load the raid log:', error);
          this.loadError.set('The raid log could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }
}

function amountOf(member: RaidMember, metric: LogMetric): number {
  switch (metric) {
    case 'healing':
      return member.healing + member.absorbs;
    case 'taken':
      return member.damageTaken;
    default:
      return member.damage;
  }
}
