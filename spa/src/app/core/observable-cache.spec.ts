import { Observable, defer, firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ObservableCache } from './observable-cache';

describe('ObservableCache', () => {
  it('loads a key once and shares the result', async () => {
    const cache = new ObservableCache();
    let loads = 0;
    const load = (): Observable<number> => defer(() => of(++loads));

    expect(await firstValueFrom(cache.get('a', load))).toBe(1);
    expect(await firstValueFrom(cache.get('a', load))).toBe(1);
    expect(await firstValueFrom(cache.get('b', load))).toBe(2);
  });

  it('forgets a failed load, so the next call tries again', async () => {
    const cache = new ObservableCache();
    let attempts = 0;
    const load = (): Observable<string> => defer(() => ++attempts === 1 ? throwError(() => new Error('offline')) : of('ok'));

    await expect(firstValueFrom(cache.get('a', load))).rejects.toThrow('offline');
    expect(await firstValueFrom(cache.get('a', load))).toBe('ok');
  });

  it('starts over after clear', async () => {
    const cache = new ObservableCache();
    let loads = 0;
    const load = (): Observable<number> => defer(() => of(++loads));

    await firstValueFrom(cache.get('a', load));
    cache.clear();

    expect(await firstValueFrom(cache.get('a', load))).toBe(2);
  });
});
