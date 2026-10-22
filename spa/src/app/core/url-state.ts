import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

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

export function parseInteger(value: string | null): number | undefined {
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) ? number : undefined;
}

export function parsePage(value: string | null): number {
  const page = parseInteger(value);
  return page !== undefined && page > 0 ? page : 1;
}
