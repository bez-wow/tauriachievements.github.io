import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import { NavigationError } from '@angular/router';

const LAST_RELOAD_KEY = 'new_deploy_reload_at';
const RELOAD_GUARD_MS = 30_000;

export function isMissingChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|module script failed/i.test(message);
}

export function canReloadAgain(lastReloadAt: string | null, now: number): boolean {
  return !(now - Number(lastReloadAt ?? 0) < RELOAD_GUARD_MS);
}

export function reloadOnNewDeploy(navigationError: NavigationError): void {
  if (!isMissingChunkError(navigationError.error)) {
    return;
  }

  const document = inject(DOCUMENT);
  try {
    const storage = document.defaultView?.sessionStorage;
    const now = Date.now();
    if (!canReloadAgain(storage?.getItem(LAST_RELOAD_KEY) ?? null, now)) {
      return;
    }
    storage?.setItem(LAST_RELOAD_KEY, String(now));
  } catch {
    return;
  }

  document.location.assign(navigationError.url);
}
