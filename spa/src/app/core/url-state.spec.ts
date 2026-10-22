import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { ReplaceUrl, injectReplaceUrl, parseInteger, parsePage } from './url-state';

@Component({ template: '' })
class PageStub {
  readonly replaceUrl: ReplaceUrl = injectReplaceUrl();
}

async function openStub(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'pages/:id', component: PageStub }]), provideLocationMocks()]
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(url, PageStub);
  return { page, location: TestBed.inject(Location) };
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
