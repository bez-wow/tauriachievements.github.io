import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Player } from './models/character.model';
import { LadderService } from './ladder.service';
import { DataSyncService } from './services/data-sync.service';

class DataSyncServiceStub {
  private readonly players$ = new BehaviorSubject<Player[]>([]);

  getPlayers() {
    return this.players$.asObservable();
  }

  getCurrentPlayers() {
    return this.players$.value;
  }

  setPlayers(players: Player[]) {
    this.players$.next(players);
  }
}

describe('LadderService', () => {
  let dataSyncService: DataSyncServiceStub;
  let service: LadderService;

  beforeEach(() => {
    dataSyncService = new DataSyncServiceStub();
    service = new LadderService(dataSyncService as unknown as DataSyncService);
    dataSyncService.setPlayers([
      createPlayer({
        name: 'Alpha',
        realm: 'Tauri',
        guild: 'Raiders',
        class: 1,
        achievementPoints: 500,
        honorableKills: 10,
        faction: 'Horde'
      }),
      createPlayer({
        name: 'Bravo',
        realm: 'Evermoon',
        guild: 'Leviathan',
        class: 8,
        achievementPoints: 1500,
        honorableKills: 200,
        faction: 'Alliance'
      }),
      createPlayer({
        name: 'Charlie',
        realm: 'Tauri',
        guild: 'Outlaws',
        class: 11,
        achievementPoints: 1200,
        honorableKills: 500,
        faction: 'Alliance'
      }),
      createPlayer({
        name: 'Delta',
        realm: 'WoD',
        guild: 'Frost',
        class: 1,
        achievementPoints: 900,
        honorableKills: 50,
        faction: 'Horde'
      })
    ]);
  });

  it('returns players from the pre-sorted achievement ranking', async () => {
    const players = await firstValueFrom(service.getAchievements(undefined, undefined, undefined, undefined, 1, 4));

    expect(players.map(player => player.name)).toEqual(['Bravo', 'Charlie', 'Delta', 'Alpha']);
  });

  it('matches search terms against normalized player and guild names', async () => {
    const guildMatch = await firstValueFrom(service.getAchievements(undefined, undefined, undefined, '  levi  ', 1, 10));
    const playerMatch = await firstValueFrom(service.getAchievements(undefined, undefined, undefined, 'cHaR', 1, 10));

    expect(guildMatch.map(player => player.name)).toEqual(['Bravo']);
    expect(playerMatch.map(player => player.name)).toEqual(['Charlie']);
  });

  it('keeps pagination on the sorted list while applying filters', async () => {
    const firstPage = await firstValueFrom(service.getAchievements('Tauri', undefined, undefined, undefined, 1, 1));
    const secondPage = await firstValueFrom(service.getAchievements('Tauri', undefined, undefined, undefined, 2, 1));

    expect(firstPage.map(player => player.name)).toEqual(['Charlie']);
    expect(secondPage.map(player => player.name)).toEqual(['Alpha']);
  });

  it('rebuilds the cached indexes when the source dataset changes', async () => {
    const updatedPlayers = [
      createPlayer({
        name: 'Echo',
        realm: 'Evermoon',
        guild: 'Skyline',
        class: 3,
        achievementPoints: 3000,
        honorableKills: 25,
        faction: 'Alliance'
      }),
      ...dataSyncService.getCurrentPlayers()
    ];

    dataSyncService.setPlayers(updatedPlayers);

    const players = await firstValueFrom(service.getAchievements(undefined, undefined, undefined, undefined, 1, 1));

    expect(players[0]?.name).toBe('Echo');
  });
});

function createPlayer(overrides: Partial<Player>): Player {
  return {
    name: overrides.name ?? 'Player',
    race: overrides.race ?? 1,
    gender: overrides.gender ?? 0,
    class: overrides.class ?? 1,
    realm: overrides.realm ?? 'Tauri',
    guild: overrides.guild ?? '',
    achievementPoints: overrides.achievementPoints ?? 0,
    honorableKills: overrides.honorableKills ?? 0,
    mounts: overrides.mounts ?? 0,
    faction: overrides.faction ?? 'Horde',
    lastUpdated: overrides.lastUpdated ?? new Date('2026-03-28T00:00:00.000Z')
  };
}
