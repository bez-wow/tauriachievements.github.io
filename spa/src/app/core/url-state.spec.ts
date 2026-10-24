import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { provideRouter, withRouterConfig } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { ReplaceUrl, injectQueryParamMap, injectReplaceUrl, parseInteger, parsePage } from './url-state';

@Component({ template: '' })
class PageStub {
  readonly replaceUrl: ReplaceUrl = injectReplaceUrl();
  readonly difficulties: (string | null)[] = [];

  constructor() {
    injectQueryParamMap()
      .pipe(takeUntilDestroyed())
      .subscribe(params => this.difficulties.push(params.get('difficulty')));
  }
}

async function openStub(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'pages/:id', component: PageStub }], withRouterConfig({ onSameUrlNavigation: 'reload' })),
      provideLocationMocks()
    ]
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(url, PageStub);
  return { harness, page, location: TestBed.inject(Location) };
}

describe('injectReplaceUrl', () => {
  it('writes the page\'s query parameters, leaving out the null ones', async () => {
    const { page, location } = await openStub('/pages/1?old=1');

    page.replaceUrl({ period: 'week', role: null });

    expect(location.path()).toBe('/pages/1?period=week');
  });

  it('can move to a canonical path, or keep the parameters it doesn\'t name', async () => {
    const { page, location } = await openStub('/pages/1?view=a');

    page.replaceUrl({ spec: 'Frost' }, { path: ['/pages', 'One'] });
    expect(location.path()).toBe('/pages/One?spec=Frost');

    page.replaceUrl({ tab: 'b' }, { merge: true });
    expect(location.path()).toBe('/pages/1?view=a&tab=b');
  });
});

describe('injectQueryParamMap', () => {
  it('hands the page its parameters on every navigation, even to the address the router last opened', async () => {
    const { harness, page, location } = await openStub('/pages/1?difficulty=mythic');

    page.replaceUrl({ difficulty: 'heroic' });
    let seen = page.difficulties.length;
    await harness.navigateByUrl('/pages/1?difficulty=mythic');

    expect(location.path()).toBe('/pages/1?difficulty=mythic');
    expect(page.difficulties.slice(seen)).toEqual(['mythic']);

    seen = page.difficulties.length;
    await harness.navigateByUrl('/pages/1?difficulty=normal');
    expect(page.difficulties.slice(seen)).toEqual(['normal']);
  });
});

describe('parseInteger and parsePage', () => {
  it('reads whole numbers only', () => {
    expect(parseInteger('12')).toBe(12);
    expect(parseInteger('1.5')).toBeUndefined();
    expect(parseInteger('x')).toBeUndefined();
    expect(parseInteger(null)).toBeUndefined();
  });

  it('starts on page 1 for anything that isn\'t a page', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-2')).toBe(1);
    expect(parsePage(null)).toBe(1);
  });
});
