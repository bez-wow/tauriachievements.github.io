import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, ParamMap, Params, Router } from '@angular/router';
import { Observable, filter, map, startWith } from 'rxjs';

export interface ReplaceUrlOptions {
  readonly path?: readonly unknown[];
  readonly merge?: boolean;
}

export type ReplaceUrl = (queryParams: Params, options?: ReplaceUrlOptions) => void;

export function injectReplaceUrl(): ReplaceUrl {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const location = inject(Location);

  return (queryParams, options = {}) => {
    const url = router.createUrlTree(options.path ? [...options.path] : [], {
      relativeTo: options.path ? undefined : route,
      queryParams,
      queryParamsHandling: options.merge ? 'merge' : undefined
    });
    location.replaceState(router.serializeUrl(url));
  };
}

export function injectQueryParamMap(): Observable<ParamMap> {
  const router = inject(Router);
  const route = inject(ActivatedRoute);

  return router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    startWith(undefined),
    map(() => route.snapshot.queryParamMap)
  );
}

export function parseInteger(value: string | null): number | undefined {
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) ? number : undefined;
}

export function parsePage(value: string | null): number {
  const page = parseInteger(value);
  return page !== undefined && page > 0 ? page : 1;
}
