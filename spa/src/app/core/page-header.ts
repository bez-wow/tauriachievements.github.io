import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { getLocalTimeZoneLabel } from './time-zone-label';

export interface PageHeader {
  readonly lastEdited?: Date;
  readonly label?: string;
  readonly timeZone?: string;
  readonly timeZoneLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class PageHeaderService {
  private owner?: object;
  private readonly current = signal<PageHeader>({});

  readonly lastEdited = computed(() => this.current().lastEdited);
  readonly label = computed(() => this.current().label ?? 'Last updated:');
  readonly timeZone = computed(() => this.current().timeZone);
  readonly timeZoneLabel = computed(() => this.current().timeZoneLabel ?? getLocalTimeZoneLabel(this.lastEdited()));

  show(owner: object, header: PageHeader): void {
    this.owner = owner;
    this.current.set(header);
  }

  release(owner: object): void {
    if (this.owner === owner) {
      this.owner = undefined;
      this.current.set({});
    }
  }
}

export function setPageHeader(header: () => PageHeader): void {
  const service = inject(PageHeaderService);
  const owner = {};
  effect(() => service.show(owner, header()));
  inject(DestroyRef).onDestroy(() => service.release(owner));
}
