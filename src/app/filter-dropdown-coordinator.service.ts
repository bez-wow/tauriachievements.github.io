import { Injectable, signal } from '@angular/core';

@Injectable()
export class FilterDropdownCoordinatorService {
  private readonly openDropdownId = signal<string | null>(null);

  isOpen(dropdownId: string): boolean {
    return this.openDropdownId() === dropdownId;
  }

  open(dropdownId: string): void {
    this.openDropdownId.set(dropdownId);
  }

  toggle(dropdownId: string): void {
    this.openDropdownId.set(this.isOpen(dropdownId) ? null : dropdownId);
  }

  close(dropdownId: string): void {
    if (this.isOpen(dropdownId)) {
      this.openDropdownId.set(null);
    }
  }

  closeAll(): void {
    this.openDropdownId.set(null);
  }

  closeOthers(dropdownId: string): void {
    if (!this.isOpen(dropdownId)) {
      this.openDropdownId.set(null);
    }
  }
}
