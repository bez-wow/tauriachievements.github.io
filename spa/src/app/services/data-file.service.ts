import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, throwError } from 'rxjs';

interface DataManifest {
  files: Record<string, string>;
}

const MANIFEST_URL = 'assets/data/data-manifest.json';

/**
 * The one way the app loads its data files (JSON and text under the site root).
 *
 * Each file is requested as `file?v=<content hash>`, with the hashes read from a manifest
 * the build writes (scripts/generate-data-manifest.js). The URL therefore changes exactly
 * when the file does: browsers keep a file cached across visits and still pick up a new
 * deploy immediately. Only the tiny manifest is fetched fresh, once per session.
 */
@Injectable({ providedIn: 'root' })
export class DataFileService {
  private readonly http = inject(HttpClient);
  private readonly sessionStamp = Date.now();
  private readonly memoized = new Map<string, Observable<unknown>>();

  private readonly manifest$: Observable<DataManifest> = this.http
    .get<DataManifest>(`${MANIFEST_URL}?v=${this.sessionStamp}`)
    .pipe(
      catchError((error: unknown) => {
        console.warn('Could not load the data manifest; data files will not be cached.', error);
        return of({ files: {} });
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

  /**
   * Loads a JSON file once per session and shares the parsed result with every caller.
   * A failed load is forgotten, so a retry fetches again.
   */
  getJson<T>(path: string): Observable<T> {
    return this.memoize(path, () => this.fetchJson<T>(path));
  }

  /** Loads a text file once per session and shares it with every caller. */
  getText(path: string): Observable<string> {
    return this.memoize(`text:${path}`, () =>
      this.versionedUrl(path).pipe(switchMap((url) => this.http.get(url, { responseType: 'text' })))
    );
  }

  /**
   * Fetches a JSON file without keeping the parsed result. Meant for large files that the
   * caller converts into its own structures; the browser's HTTP cache still applies.
   */
  fetchJson<T>(path: string): Observable<T> {
    return this.versionedUrl(path).pipe(switchMap((url) => this.http.get<T>(url)));
  }

  private versionedUrl(path: string): Observable<string> {
    return this.manifest$.pipe(
      map((manifest) => `${path}?v=${manifest.files[path] ?? this.sessionStamp}`)
    );
  }

  private memoize<T>(key: string, load: () => Observable<T>): Observable<T> {
    let cached = this.memoized.get(key) as Observable<T> | undefined;

    if (!cached) {
      cached = load().pipe(
        catchError((error: unknown) => {
          this.memoized.delete(key);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.memoized.set(key, cached);
    }

    return cached;
  }
}
