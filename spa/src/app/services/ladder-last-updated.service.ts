import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { DataFileService } from './data-file.service';
import { getLocalTimeZoneLabel } from '../../utils/time-zone-label';

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
      timeZoneLabel: getLocalTimeZoneLabel(parsed)
    };
  }
}
