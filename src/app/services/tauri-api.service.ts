import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../../environments/environment';
import { TauriApiRequest, TauriCharacterSheetResponse, TauriGuildRosterResponse } from '../models/character.model';

@Injectable({ providedIn: 'root' })
export class TauriApiService {
  private baseUrl = environment.tauriApi.baseUrl;
  private apiKey = environment.tauriApi.apiKey;
  private secret = environment.tauriApi.secret;

  constructor(private http: HttpClient) {}

  /**
   * Get character sheet data from Tauri API
   */
  getCharacterSheet(characterName: string, realmApi: string): Observable<TauriCharacterSheetResponse> {
    const apiUrl = `${this.baseUrl}?apikey=${this.apiKey}`;
    const body: TauriApiRequest = {
      secret: this.secret,
      url: 'character-sheet',
      params: {
        r: realmApi,
        n: characterName
      }
    };

    return this.http.post<TauriCharacterSheetResponse>(apiUrl, body);
  }

  /**
   * Get guild roster from Tauri API
   */
  getGuildRoster(guildName: string, realmApi: string): Observable<TauriGuildRosterResponse> {
    const apiUrl = `${this.baseUrl}?apikey=${this.apiKey}`;
    const body = {
      secret: this.secret,
      url: 'guild-roster',
      params: {
        r: realmApi,
        gn: guildName
      }
    };

    return this.http.post<TauriGuildRosterResponse>(apiUrl, body);
  }

  /**
   * Batch fetch character sheets with delay to avoid rate limiting
   */
  async batchFetchCharacters(
    characters: Array<{ name: string; realmApi: string; realmDisplay: string }>,
    delayMs: number = 100,
    onProgress?: (current: number, total: number) => void
  ): Promise<Array<{ character: { name: string; realmApi: string; realmDisplay: string }; response: TauriCharacterSheetResponse }>> {
    const results: Array<{ character: { name: string; realmApi: string; realmDisplay: string }; response: TauriCharacterSheetResponse }> = [];

    for (let i = 0; i < characters.length; i++) {
      const character = characters[i];
      try {
        const response = await this.getCharacterSheet(character.name, character.realmApi).toPromise();
        if (response) {
          results.push({ character, response });
        }
        
        if (onProgress) {
          onProgress(i + 1, characters.length);
        }

        // Add delay to avoid rate limiting
        if (i < characters.length - 1) {
          await this.delay(delayMs);
        }
      } catch (error) {
        console.error(`Failed to fetch character ${character.name} on ${character.realmDisplay}:`, error);
        // Continue with next character
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
