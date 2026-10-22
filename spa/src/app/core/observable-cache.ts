import { Observable, catchError, shareReplay, throwError } from 'rxjs';

export class ObservableCache {
  private readonly entries = new Map<string, Observable<unknown>>();

  get<T>(key: string, load: () => Observable<T>): Observable<T> {
    let cached = this.entries.get(key) as Observable<T> | undefined;

    if (!cached) {
      cached = load().pipe(
        catchError((error: unknown) => {
          this.entries.delete(key);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.entries.set(key, cached);
    }

    return cached;
  }

  clear(): void {
    this.entries.clear();
  }
}
