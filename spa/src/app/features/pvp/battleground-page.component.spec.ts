import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BattlegroundPageComponent } from './battleground-page.component';
import { BattlegroundsService } from './battlegrounds.service';

describe('BattlegroundPageComponent', () => {
  it('renders the timeline dropdown without a dependency injection error', async () => {
    await TestBed.configureTestingModule({
      imports: [BattlegroundPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: BattlegroundsService,
          useValue: {
            getBattlegrounds: () => of({
              version: 1,
              era: 'legion',
              names: ['Warsong Gulch'],
              days: [
                ['2026-07-15', [0, 540, 600]],
                ['2026-07-16', [0, 540, 600]]
              ]
            }),
            getCollectorState: () => of({ lastScanUtc: '2026-07-16T09:00:00Z' })
          }
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(BattlegroundPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-filter-dropdown')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Legion');
  });
});
