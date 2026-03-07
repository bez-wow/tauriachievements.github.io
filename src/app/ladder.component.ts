import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { PlayerAchievement } from './models/achievement.model';
import { LadderService } from './ladder.service';
import { DataSyncService } from './services/data-sync.service';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { openArmory, getArmoryUrl, getGuildArmoryUrl } from '../utils/armory';

@Component({
  selector: 'app-achievement-ladder',
  templateUrl: './ladder.component.html',
  styleUrls: ['./ladder.component.scss'],
  standalone: true,
  imports: [CommonModule, HttpClientModule]
})
export class AchievementLadderComponent implements OnInit {
  players: PlayerAchievement[] = [];
  currentSort: 'achievementPoints' | 'honorableKills' = 'achievementPoints';
  currentRealm?: string = undefined;
  currentFaction?: string;
  currentClass?: number;
  pageSize = 100;
  sortMenuOpen = false;
  realmMenuOpen = false;
  factionMenuOpen = false;
  classMenuOpen = false;
  selectedSortLabel = 'Achievement Points';
  selectedRealmLabel = 'All Realms';
  selectedFactionLabel = 'All Factions';
  selectedClassLabel = 'All Classes';
  selectedClassIcon?: string;
  lastEdited?: Date;
  showBackToTop = false;
  getClassIconPath = getClassIconPath;
  openArmory = openArmory;
  getArmoryUrl = getArmoryUrl;
  getGuildArmoryUrl = getGuildArmoryUrl;
  sortOptions: Array<{ value: 'achievementPoints' | 'honorableKills'; label: string }> = [
    { value: 'achievementPoints', label: 'Achievement Points' },
    { value: 'honorableKills', label: 'Honorable Kills' }
  ];

  realmOptions = [
    { value: undefined, label: 'All Realms' },
    { value: 'Evermoon', label: 'Evermoon' },
    { value: 'Tauri', label: 'Tauri' },
    { value: 'WoD', label: 'WoD' },
  ];

  factionOptions = [
    { value: undefined, label: 'All Factions' },
    { value: 'Horde', label: 'Horde' },
    { value: 'Alliance', label: 'Alliance' }
  ];

  classOptions = [
    { id: 6, name: 'Death Knight', icon: getClassIconPath(6) },
    { id: 12, name: 'Demon Hunter', icon: getClassIconPath(12) },
    { id: 11, name: 'Druid', icon: getClassIconPath(11) },
    { id: 3, name: 'Hunter', icon: getClassIconPath(3) },
    { id: 8, name: 'Mage', icon: getClassIconPath(8) },
    { id: 10, name: 'Monk', icon: getClassIconPath(10) },
    { id: 2, name: 'Paladin', icon: getClassIconPath(2) },
    { id: 5, name: 'Priest', icon: getClassIconPath(5) },
    { id: 4, name: 'Rogue', icon: getClassIconPath(4) },
    { id: 7, name: 'Shaman', icon: getClassIconPath(7) },
    { id: 9, name: 'Warlock', icon: getClassIconPath(9) },
    { id: 1, name: 'Warrior', icon: getClassIconPath(1) },
  ];

  constructor(
    private ladderService: LadderService,
    private dataSyncService: DataSyncService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.applyFilters();
    this.syncData();
    this.loadLastUpdated();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    this.showBackToTop = scrollTop > 400;
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async syncData() {
    try {
      await this.dataSyncService.syncData();
      this.applyFilters();
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to sync data:', error);
    }
  }

  applyFilters() {
    this.loadPlayers();
  }

  closeAllDropdowns(except?: 'class' | 'sort' | 'realm' | 'faction') {
    if (except !== 'class') this.classMenuOpen = false;
    if (except !== 'sort') this.sortMenuOpen = false;
    if (except !== 'realm') this.realmMenuOpen = false;
    if (except !== 'faction') this.factionMenuOpen = false;
  }

  toggleClassMenu() {
    const nextState = !this.classMenuOpen;
    this.closeAllDropdowns('class');
    this.classMenuOpen = nextState;
  }

  toggleSortMenu() {
    const nextState = !this.sortMenuOpen;
    this.closeAllDropdowns('sort');
    this.sortMenuOpen = nextState;
  }

  toggleRealmMenu() {
    const nextState = !this.realmMenuOpen;
    this.closeAllDropdowns('realm');
    this.realmMenuOpen = nextState;
  }

  toggleFactionMenu() {
    const nextState = !this.factionMenuOpen;
    this.closeAllDropdowns('faction');
    this.factionMenuOpen = nextState;
  }

  selectSort(option: { value: 'achievementPoints' | 'honorableKills'; label: string }) {
    this.currentSort = option.value;
    this.selectedSortLabel = option.label;
    this.sortMenuOpen = false;
    this.applyFilters();
  }

  selectRealm(option: { value: string | undefined; label: string }) {
    this.currentRealm = option.value;
    this.selectedRealmLabel = option.label;
    this.realmMenuOpen = false;
    this.applyFilters();
  }

  selectFaction(option: { value: string | undefined; label: string }) {
    this.currentFaction = option.value;
    this.selectedFactionLabel = option.label;
    this.factionMenuOpen = false;
    this.applyFilters();
  }

  selectClass(option?: { id: number; name: string; icon: string }) {
    this.currentClass = option?.id;
    this.selectedClassLabel = option ? option.name : 'All Classes';
    this.selectedClassIcon = option?.icon;
    this.classMenuOpen = false;
    this.applyFilters();
  }

  setPageSize(size: number) {
    this.pageSize = size;
    this.applyFilters();
  }

  resetFilters() {
    this.currentSort = 'achievementPoints';
    this.selectedSortLabel = 'Achievement Points';

    this.currentRealm = undefined;
    this.selectedRealmLabel = 'All Realms';

    this.currentFaction = undefined;
    this.selectedFactionLabel = 'All Factions';

    this.currentClass = undefined;
    this.selectedClassLabel = 'All Classes';
    this.selectedClassIcon = undefined;

    this.closeAllDropdowns();
    this.applyFilters();
  }

  private loadPlayers() {
    const observable = this.currentSort === 'achievementPoints'
      ? this.ladderService.getAchievements(this.currentRealm, this.currentFaction, this.currentClass, 1, this.pageSize)
      : this.ladderService.getHonorableKills(this.currentRealm, this.currentFaction, this.currentClass, 1, this.pageSize);
    
    observable.subscribe(data => {
      this.updatePlayers(data);
    });
  }

  private updatePlayers(data: any[]) {
    this.players = data.map((item, idx) => ({
      rank: idx + 1,
      name: item.name,
      realm: item.realm,
      race: item.race,
      gender: item.gender,
      raceIcon: getRaceIconPath(item.race, item.gender),
      classIcon: item.class.toString(),
      guild: item.guild,
      achievementPoints: item.achievementPoints,
      honorableKills: item.honorableKills,
      faction: item.faction
    }));
    this.cdr.markForCheck();
  }

  private loadLastUpdated() {
    const cacheBustedUrl = `lastUpdated.txt?v=${Date.now()}`;
    this.http.get(cacheBustedUrl, { responseType: 'text' }).subscribe({
      next: (value) => {
        const parsed = new Date(value.trim());
        if (isNaN(parsed.getTime())) {
          console.warn('Invalid lastUpdated.txt date:', value);
          return;
        }
        this.lastEdited = parsed;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to load lastUpdated.txt:', error);
      }
    });
  }

  onImageError(event: any) {
    console.error('Failed to load image:', event.target.src);
  }
}
