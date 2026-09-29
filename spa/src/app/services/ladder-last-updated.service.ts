import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { DataFileService } from './data-file.service';

export interface LadderLastUpdated {
  date: Date;
  timeZoneLabel: string;
}

@Injectable({ providedIn: 'root' })
export class LadderLastUpdatedService {
  private readonly dataFiles = inject(DataFileService);

  getLastUpdated(): Observable<LadderLastUpdated | null> {
    return this.dataFiles.getText('lastUpdated.txt').pipe(
      map((value) => this.parseLastUpdated(value)),
      catchError((error) => {
        console.error('Failed to load lastUpdated.txt:', error);
        return of(null);
      })
    );
  }

  private parseLastUpdated(value: string): LadderLastUpdated | null {
    const parsed = new Date(value.trim());
    if (Number.isNaN(parsed.getTime())) {
      console.warn('Invalid lastUpdated.txt date:', value);
      return null;
    }

    return {
      date: parsed,
      timeZoneLabel: this.getTimeZoneLabel(parsed)
    };
  }

  private getTimeZoneLabel(date: Date): string {
    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date);
      return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'Local time';
    } catch {
      return 'Local time';
    }
  }
}
