import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NAV_SECTIONS } from './nav-sections';
import { UpdateBarComponent } from './update-bar.component';

@Component({ template: '' })
class BlankPageComponent {}

const routes: Routes = [
  ...NAV_SECTIONS.flatMap((section) => section.pages.map((page) => ({ path: page.path.slice(1), component: BlankPageComponent }))),
  { path: '**', component: BlankPageComponent }
];

const dialogMethods = ['showModal', 'close'] as const;
const nativeDialogMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));

async function render(url: string): Promise<ComponentFixture<UpdateBarComponent>> {
  await TestBed.configureTestingModule({
    imports: [UpdateBarComponent],
    providers: [provideRouter(routes)]
  }).compileComponents();

  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(UpdateBarComponent);
  fixture.detectChanges();
  return fixture;
}

function query<T extends Element>(fixture: ComponentFixture<UpdateBarComponent>, selector: string): T {
  return fixture.nativeElement.querySelector(selector) as T;
}

function openDrawer(fixture: ComponentFixture<UpdateBarComponent>): HTMLDialogElement {
  query<HTMLButtonElement>(fixture, '.site-menu-toggle').click();
  fixture.detectChanges();
  return query<HTMLDialogElement>(fixture, '.site-drawer');
}

describe('UpdateBarComponent drawer', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  });

  afterEach(() => {
    dialogMethods.forEach((name, index) => {
      const native = nativeDialogMethods[index];
      if (native) {
        Object.defineProperty(HTMLDialogElement.prototype, name, native);
      } else {
        delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)[name];
      }
    });
  });

  it('labels the menu button with the current page', async () => {
    const fixture = await render('/raid-logs/leaderboard');
    const toggle = query<HTMLButtonElement>(fixture, '.site-menu-toggle');

    expect(toggle.textContent).toContain('Character Rankings');
    expect(toggle.getAttribute('aria-label')).toBe('Menu: Character Rankings');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('reads just "Menu" on a page outside the navigation', async () => {
    const fixture = await render('/endless-f8c2a91d');
    const toggle = query<HTMLButtonElement>(fixture, '.site-menu-toggle');

    expect(toggle.textContent?.trim()).toBe('Menu');
    expect(toggle.hasAttribute('aria-label')).toBe(false);
  });

  it('opens with every page listed and only the current one marked', async () => {
    const fixture = await render('/mythic-plus/stats');
    const drawer = openDrawer(fixture);
    const current = drawer.querySelectorAll('.site-drawer-nav [aria-current="page"]');

    expect(drawer.open).toBe(true);
    expect(query(fixture, '.site-menu-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(drawer.querySelectorAll('.site-drawer-page')).toHaveLength(23);
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Statistics');
  });

  it('shows a page tag beside its name', async () => {
    const fixture = await render('/');
    const drawer = openDrawer(fixture);
    const hallOfFame = Array.from(drawer.querySelectorAll('.site-drawer-page'))
      .find((link) => link.textContent?.includes('Hall of Fame'));

    expect(hallOfFame?.querySelector('.site-drawer-tag')?.textContent).toBe('Archive');
  });

  it('closes when a page is picked', async () => {
    const fixture = await render('/');
    const drawer = openDrawer(fixture);

    drawer.querySelector<HTMLAnchorElement>('.site-drawer-page:not(.is-current)')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(drawer.open).toBe(false);
    expect(query(fixture, '.site-menu-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a backdrop click but not on a click inside the drawer', async () => {
    const fixture = await render('/');
    const drawer = openDrawer(fixture);

    drawer.querySelector<HTMLElement>('.site-drawer-head')!.click();
    fixture.detectChanges();
    expect(drawer.open).toBe(true);

    drawer.click();
    fixture.detectChanges();
    expect(drawer.open).toBe(false);
  });
});
