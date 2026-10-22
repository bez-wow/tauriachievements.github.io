# Motion and rendering

The Mythic+, Raids, Support and Addon pages animate. The browser behaviour below has broken
that animation silently before, with the build and tests still green. Read this before
touching motion or layering.

## The pieces

- **Tokens** in `src/scss/_motion.scss`: `--ease-out`, `--ease-in-out`, `--ease-spring`,
  `--dur-fast`, `--dur`, `--dur-slow`. `--ease-spring` must stay in step with `SPRING` in
  `src/app/shared/motion/motion.ts`, which the directives use for Web Animations.
- **Keyframes:** every one the M+ and Support motion uses is global in `_motion.scss`, with an
  `mp-` prefix (see the first gotcha).
- **Page changes:** `withViewTransitions()`. `_motion.scss` styles `::view-transition-old/new`
  and gives `.update-bar` its own `view-transition-name`, so the header stays put while the
  page changes. The old page fades out quickly and the new one rises in, with
  `mix-blend-mode: normal`: the browser's default `plus-lighter` brightens the moment the two
  pages overlap. `characterTransitionName()` (`motion.ts`) names a character's crest and name
  so they glide between pages. It hashes the key, because keys can hold `#` and Cyrillic.
- **Directives:**

  | Directive | Does |
  |---|---|
  | `appGlide` | slides one highlight to a switch's `.active` option (`glide-pill` / `glide-frame` mixins) |
  | `appReveal` | plays an entrance once, when the host scrolls into view (`data-reveal` pending → in → removed) |
  | `appCountUp` | counts a number up to its value |
  | `appFlip` | animates a re-ordered, re-sized chart into its new shape |
  | `appSpotlight` | follows the mouse in `--spot-x` / `--spot-y` to light a card's border |
  | `appDecode` | scrambles text into place over an `aria-hidden` overlay; the real text stays for layout and screen readers |
  | `appScrollRise` | marks only the elements that start below the fold for a scroll-driven rise |

- **Directive details:**
  - `appCountUp` replaces its host's content, so leave the host empty. A first value counts up
    from zero; a later one counts on from the number shown, so switching Season / This week
    rolls the numbers. Text without a number is written as it is, and so is a rank (`#3`):
    counting up from `#0` would read as passing through better ranks. It writes the DOM from
    `requestAnimationFrame`, so counting runs no change detection.
  - `appDecode` never touches the host's text: while it decodes the text isn't painted
    (`-webkit-text-fill-color`, so icons and borders that use `currentColor` stay) and an overlay
    draws the characters. Elements marked `aria-hidden` are left alone. Don't nest one decoding
    host inside another.
  - `appReveal` sets `data-reveal="pending"` before the first paint, `in` once the host's top is
    on screen, and removes it when the entrance is over, so a later re-render doesn't replay it.
    The component's stylesheet holds the animation under those two attribute values.
  - `appFlip` takes something that changes with the content as its value, and runs after each
    render in which it changed; the first render only records positions.
- **Expand and collapse** use Angular's built-in `animate.leave`, on the element inside the
  `@if`. The `details-reveal` mixin (`_mythic-plus-shared.scss`) opens and closes a panel by
  height: the element inside the `@if` carries `animate.leave="details-leaving"` and is (or, for
  a table row, holds) a `.details-reveal` whose one child `.details-clip` holds the content. A
  table row can't shrink, so it fades for as long as the panel inside takes to close.
- **Chart tooltips** grow out of what they point at: `tooltip-pop` on the tooltip,
  `tooltip-shown` in each rule that opens it. The scan-change tooltips (rank and score arrows)
  open at once, with no transition or delay.
- **Chart lines** draw in by uncovering them with a clip, not with `stroke-dashoffset`: the
  stroke doesn't scale with the chart, so a dash draw comes out uneven. The Score / Gap switch
  morphs a line through the CSS `d` property, which can transition; browsers without it keep
  the `d` attribute and jump.
- **Reduced motion:** wrap animation in the `motion-safe` mixin
  (`@media (prefers-reduced-motion: no-preference)`). The directives check
  `prefersReducedMotion()` and do nothing when it's on. View transitions are switched off
  under `reduce`.

## Gotchas

**Component keyframes referenced inside `@media` don't run.** Angular's emulated encapsulation
renames a component's own `@keyframes`, but it only rewrites `animation:` references in
top-level rules. Inside `@media (prefers-reduced-motion: no-preference) { … }` the reference
keeps the plain name and matches nothing. That's why every animation used inside `motion-safe`
gets a global `mp-*` keyframe in `_motion.scss`. To check a build:
`grep -o "animation:[^;}]*" dist/**/*.js`. Every name must be `mp-*` or end in
`_ngcontent-*`.

**`backdrop-filter` inside the header blurs nothing.** The `view-transition-name` on
`.update-bar` makes the header a backdrop root. Use opaque backgrounds there.

**Layer promotion turns off LCD text on Windows** (text renders grey and soft). Each of these
keeps an element, or the whole page, on its own compositing layer:

- any `mix-blend-mode` on a page element, even at `opacity: 0`;
- `animation-fill-mode: both` on an entrance, which leaves `filter: blur(0)` or
  `translate: 0px` behind. Entrances that end on the static value use `backwards`;
- scroll-driven animations (`animation-timeline: view()`), which keep their element layered
  for good. That's why `appScrollRise` marks only the elements that start below the fold.

Check with pixel or colour samples against a reduced-motion run, not by eye.

**A glow behind an element jumps in front of it** once that element becomes a stacking
context. A `::before` glow with `z-index: -1` sits behind the element's background only while
the element is not one; a `view-transition-name`, a transform, `scale` / `translate`, or
`opacity < 1` makes it one. Put names and motion on the image inside, not on the element with
the glow.

**Text effects:**

- Chrome doesn't kern across element boundaries, so splitting text into per-letter spans
  shifts it by fractions of a pixel. `appDecode` draws an overlay at each grapheme's `Range`
  rect instead.
- An absolutely positioned `::after` inside a line is a line-break opportunity.
- Setting `element.style` and then removing the `style` attribute can leave `style=""` behind.

**`background-size` keyframes** need one value per background layer, or the browser can't
interpolate and jumps at 50%.

## Product rules

- No entrance animation on leaderboard table rows. The owner removed it; don't suggest it
  again. Expanding and collapsing row details is fine.
- Charts keep WoW class colours.
- Motion should look premium and minimal: short, eased, never in the way of reading numbers.
