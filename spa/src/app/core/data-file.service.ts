import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';
import { ObservableCache } from './observable-cache';

interface DataManifest {
  files: Record<string, string>;
}

const MANIFEST_URL = 'assets/data/data-manifest.json';

@Injectable({ providedIn: 'root' })
export class DataFileService {
  private readonly http = inject(HttpClient);
  private sessionStamp = Date.now();
  private readonly cache = new ObservableCache();
  private manifest$ = this.loadManifest();

  refresh(): void {
    this.sessionStamp = Date.now();
    this.manifest$ = this.loadManifest();
    this.cache.clear();
  }

  getJson<T>(path: string): Observable<T> {
    return this.cache.get(path, () => this.fetchJson<T>(path));
  }

  getText(path: string): Observable<string> {
    return this.cache.get(`text:${path}`, () =>
      this.versionedUrl(path).pipe(switchMap((url) => this.http.get(url, { responseType: 'text' })))
    );
  }

  fetchJson<T>(path: string): Observable<T> {
    return this.versionedUrl(path).pipe(switchMap((url) => this.http.get<T>(url)));
  }

  private loadManifest(): Observable<DataManifest> {
    return this.http.get<DataManifest>(`${MANIFEST_URL}?v=${this.sessionStamp}`).pipe(
      catchError((error: unknown) => {
        console.warn('Could not load the data manifest; data files will not be cached.', error);
        return of({ files: {} });
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
  }

  private versionedUrl(path: string): Observable<string> {
    return this.manifest$.pipe(
      map((manifest) => `${path}?v=${manifest.files[path] ?? this.sessionStamp}`)
    );
  }
}
