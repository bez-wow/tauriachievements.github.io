import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DataFileService } from './data-file.service';

describe('DataFileService', () => {
  let service: DataFileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(DataFileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function answerManifest(files: Record<string, string>): void {
    http.expectOne((request) => request.url.startsWith('assets/data/data-manifest.json')).flush({ files });
  }

  it('versions each file with its content hash from the manifest', () => {
    service.getJson('RareItems.json').subscribe();
    answerManifest({ 'RareItems.json': 'abc123' });

    http.expectOne('RareItems.json?v=abc123').flush({});
  });

  it('loads a memoized file once and shares it between callers', () => {
    const results: unknown[] = [];

    service.getJson('RareItems.json').subscribe((value) => results.push(value));
    service.getJson('RareItems.json').subscribe((value) => results.push(value));
    answerManifest({ 'RareItems.json': 'abc123' });
    http.expectOne('RareItems.json?v=abc123').flush({ ok: true });

    expect(results).toEqual([{ ok: true }, { ok: true }]);
  });

  it('forgets a failed load so a retry fetches again', () => {
    const errors: unknown[] = [];

    service.getJson('RareItems.json').subscribe({ error: (error: unknown) => errors.push(error) });
    answerManifest({ 'RareItems.json': 'abc123' });
    http.expectOne('RareItems.json?v=abc123').flush('nope', { status: 500, statusText: 'Server Error' });
    expect(errors).toHaveLength(1);

    service.getJson('RareItems.json').subscribe();
    http.expectOne('RareItems.json?v=abc123').flush({});
  });

  it('reads a new manifest and loads memoized files again after a refresh', () => {
    const results: unknown[] = [];
    service.getJson('RareItems.json').subscribe((value) => results.push(value));
    answerManifest({ 'RareItems.json': 'old111' });
    http.expectOne('RareItems.json?v=old111').flush({ deploy: 1 });

    service.refresh();
    service.getJson('RareItems.json').subscribe((value) => results.push(value));
    answerManifest({ 'RareItems.json': 'new222' });
    http.expectOne('RareItems.json?v=new222').flush({ deploy: 2 });

    expect(results).toEqual([{ deploy: 1 }, { deploy: 2 }]);
  });

  it('still loads files when the manifest is unavailable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    service.getText('lastUpdated.txt').subscribe();
    http.expectOne((request) => request.url.startsWith('assets/data/data-manifest.json'))
      .flush('missing', { status: 404, statusText: 'Not Found' });

    const request = http.expectOne((candidate) => candidate.url.startsWith('lastUpdated.txt?v='));
    expect(request.request.responseType).toBe('text');
    request.flush('2026-09-28T17:56:32');
  });
});
