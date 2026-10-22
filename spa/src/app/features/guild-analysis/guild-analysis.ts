import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Observable, catchError, of } from 'rxjs';
import { DataFileService } from '../../core/data-file.service';
import { Realm } from '../../game/wow';

export interface GuildAnalysisPlayer {
  name: string;
  race: number;
  gender: number;
  class: number;
  guildRank?: number | null;
  guildRankName?: string | null;
  specialization?: string | null;
  playedTime: number;
  achievementPoints: number;
  artifactRelics: number;
  artifactTraits: number;
  artifacts?: GuildAnalysisArtifact[] | null;
  artifactKnowledge?: number | null;
  itemLevel: number;
  legendaries?: GuildAnalysisLegendary[];
}

export interface GuildAnalysisArtifact {
  specialization: string;
  name: string;
  traits: number;
}

export interface GuildAnalysisLegendary {
  id: number;
  name: string;
  icon: string;
  tooltipHtml?: string;
}

export interface GuildAnalysis {
  timestamp: string;
  guild?: GuildAnalysisMetadata;
  ranks?: GuildAnalysisRank[];
  players: GuildAnalysisPlayer[];
}

export interface GuildAnalysisRank {
  order: number;
  name: string;
}

export interface GuildAnalysisMetadata {
  name: string;
  realm: string;
  faction: 'Alliance' | 'Horde' | 'Unknown';
}

export interface GuildPage {
  readonly key: string;
  readonly hash: string;
  readonly name: string;
  readonly realm: Realm;
}

export const GUILD_PAGES = [
  { key: 'endless', hash: 'f8c2a91d', name: 'Endless', realm: 'Evermoon' },
  { key: 'competence-optional', hash: 'a47d9c2e', name: 'Competence Optional', realm: 'Evermoon' },
  { key: 'miracle', hash: '6e2d8f14', name: 'Miracle', realm: 'Evermoon' },
  { key: 'entropy', hash: '3e8f1a62', name: 'Entropy', realm: 'Evermoon' },
  { key: 'outlaws', hash: '34c1426b', name: 'Outlaws', realm: 'Tauri' },
  { key: 'impaired', hash: 'c18e7b42', name: 'Impaired', realm: 'Evermoon' },
  { key: 'impact', hash: '94fd2a61', name: 'Impact', realm: 'Evermoon' },
  { key: 'highly-regarded', hash: 'd74a9e3c', name: 'Highly Regarded', realm: 'Evermoon' },
  { key: 'temerite', hash: 'b93e7a41', name: 'Témérité', realm: 'Evermoon' },
  { key: 'rycerze-ortalionu', hash: 'c1ee200b', name: 'Rycerze Ortalionu', realm: 'Evermoon' }
] as const satisfies readonly GuildPage[];

export function guildPagePath(page: GuildPage): string {
  return `${page.key}-${page.hash}`;
}

export const guildAnalysisResolver: ResolveFn<GuildAnalysis | null> = (route): Observable<GuildAnalysis | null> => {
  const page = route.data['guild'] as GuildPage;

  return inject(DataFileService).getJson<GuildAnalysis>(`guild-analysis/${page.key}.json`).pipe(
    catchError((error: unknown) => {
      console.error(`Failed to load the ${page.key} guild analysis:`, error);
      return of(null);
    })
  );
};

