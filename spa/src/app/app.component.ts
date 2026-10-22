import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, Data, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { BackToTopButtonComponent } from './core/back-to-top-button.component';
import { UpdateBarComponent } from './core/update-bar.component';

function deepestRoute(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  return route.firstChild ? deepestRoute(route.firstChild) : route;
}

@Component({
  selector: 'app-root',
  template: `
    @if (showHeader()) {
      <app-update-bar />
    }
    <router-outlet />
    @if (showBackToTop()) {
      <app-back-to-top-button />
    }
  `,
  host: { '[class.no-header]': '!showHeader()' },
  imports: [RouterOutlet, UpdateBarComponent, BackToTopButtonComponent]
})
export class AppComponent {
  private readonly router = inject(Router);

  private readonly routeData = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      startWith(null),
      map((): Data => deepestRoute(this.router.routerState.snapshot.root).data)
    ),
    { requireSync: true }
  );

  readonly showHeader = computed(() => this.routeData()['header'] !== false);
  readonly showBackToTop = computed(() => this.routeData()['backToTop'] !== false);
}
