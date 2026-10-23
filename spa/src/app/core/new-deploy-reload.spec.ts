import { describe, expect, it } from 'vitest';
import { canReloadAgain, isMissingChunkError } from './new-deploy-reload';

describe('isMissingChunkError', () => {
  it('recognises a page chunk that a newer deploy removed, in every browser', () => {
    expect(isMissingChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-AB12.js'))).toBe(true);
    expect(isMissingChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isMissingChunkError(new TypeError('error loading dynamically imported module: https://x/chunk-AB12.js'))).toBe(true);
  });

  it('leaves other navigation errors alone', () => {
    expect(isMissingChunkError(new Error('NG04002: Cannot match any routes'))).toBe(false);
    expect(isMissingChunkError(undefined)).toBe(false);
  });
});

describe('canReloadAgain', () => {
  it('reloads the first time and again once the guard has passed', () => {
    expect(canReloadAgain(null, 100_000)).toBe(true);
    expect(canReloadAgain('50000', 100_000)).toBe(true);
  });

  it('does not reload twice in a row, so a deploy still going out cannot loop', () => {
    expect(canReloadAgain('90000', 100_000)).toBe(false);
  });

  it('reloads when the stored time is unreadable', () => {
    expect(canReloadAgain('garbage', 100_000)).toBe(true);
  });
});
