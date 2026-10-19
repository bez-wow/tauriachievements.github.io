# How to add a page

The Arena page (`arena-games-page.component.*` with `arena-games.ts`) is a compact recent
example to copy from.

## 0. Agree the shape first

A new route, its URL parameters and its place in the navigation are architectural decisions
(see [AGENTS.md](../../AGENTS.md)). Before writing code, agree with the owner:

- the path, and which nav section the page belongs to (label, icon);
- the URL parameters and their defaults (defaults stay out of the URL);
- the data it reads. A new data file or format is a separate decision; see
  [howto-add-exporter.md](howto-add-exporter.md).

## 1. Files

In `spa/src/app/`:

- `<name>-page.component.ts`, `.html`, `.scss`: the page.
- `<name>.ts` with `<name>.spec.ts`: everything the page computes (filters, ranking, counts,
  formatting), as pure functions with tests.

## 2. The component

```ts
@Component({
  selector: 'app-<name>-page',
  templateUrl: './<name>-page.component.html',
  styleUrls: ['./<name>-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent /* , … */],
  // Only when the page uses app-filter-dropdown:
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class <Name>PageComponent {
  private readonly dataFiles = inject(DataFileService);
  // State in signals; derived values in computed().
}
```

The template starts with the site header:

```html
<app-update-bar [lastEdited]="lastEdited()" lastEditedLabel="Last updated:" />
```

- Load data only through `DataFileService`.
- Write in-page state to the URL with `Location.replaceState`, never `router.navigate`
  ([frontend.md](../frontend.md#url-state)).
- Reuse the shared building blocks and SCSS mixins ([frontend.md](../frontend.md#shared-building-blocks)).

## 3. The route

Add a lazy route in `app.routes.ts`, above the guild pages and the final `'**'` redirect:

```ts
{
  path: '<path>',
  loadComponent: () => import('./<name>-page.component')
    .then(module => module.<Name>PageComponent)
},
```

Deep routes that belong to the page (a profile under its leaderboard) get their own entries.
Never put a dot in a path or parameter: `404.html` won't redirect it.

## 4. The navigation

Add the page to its section in `nav-sections.ts` (`label`, optional short `tab`, `icon`,
`path`; `includes` lists the deep routes that should highlight it). Then raise the page count
in both specs that pin it (22 today):

- `nav-sections.spec.ts`: `expect(paths).toHaveLength(…)`
- `update-bar.component.spec.ts`: `.site-drawer-page` count

Unlisted pages (guild pages, Rare Items) get a route but no nav entry.

## 5. Check it

- `npx ng test --watch=false` and `npm run test:scripts`.
- `npm run build`: no new budget warnings for the page's stylesheet or the initial bundle.
- In a real browser against the built `dist/` ([frontend.md](../frontend.md#checking-a-change-in-a-real-browser)):
  - open the page by deep link (with its parameters) as well as through the menu;
  - check 320, 360, 390 and 412 px for sideways scroll, plus 768 px and desktop;
  - turn on reduced motion if the page animates.
- In the PR, list the choices you made under "Choices to confirm".
