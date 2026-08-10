import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { UpdateBarComponent } from './update-bar.component';

interface ApChestLooter {
  name: string;
  guild: string;
  classId: number;
  count: number | '?';
}

const CLASS_COLORS: Record<number, string> = {
  1: '#C69B6D',
  2: '#F48CBA',
  3: '#AAD372',
  4: '#FFF468',
  5: '#FFFFFF',
  6: '#C41E3A',
  7: '#0070DD',
  8: '#3FC7EB',
  9: '#8788EE',
  10: '#00FF98',
  11: '#FF7C0A',
  12: '#A330C9'
};

@Component({
  selector: 'app-ap-chest-looters-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent],
  templateUrl: './ap-chest-looters-page.component.html',
  styleUrls: ['./ap-chest-looters-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApChestLootersPageComponent {
  private readonly http = inject(HttpClient);

  readonly looters = signal<ApChestLooter[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal(false);

  constructor() {
    this.http.get<ApChestLooter[]>('ap-chest-looters.json').subscribe({
      next: (looters) => {
        this.looters.set([...looters].sort((a, b) => this.sortValue(b.count) - this.sortValue(a.count)));
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  displayCount(count: number | '?'): string {
    return count === '?' ? '?' : count.toLocaleString();
  }

  classColor(classId: number): string {
    return CLASS_COLORS[classId] ?? '#FFFFFF';
  }

  private sortValue(count: number | '?'): number {
    return count === '?' ? Number.NEGATIVE_INFINITY : count;
  }
}
