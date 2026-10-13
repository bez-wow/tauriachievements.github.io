import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { decodeDurationFor, graphemes, isDecodable, landingTimes, randomGlyph, transformed } from './decode-text';
import { prefersReducedMotion } from './motion';

/** How often the glyphs that haven't landed change, in ms. Changing them every frame strobes. */
const GLYPH_TICK = 80;
/** Of the glyphs not landed yet, the share that change on each tick, so they don't flip in step. */
const GLYPH_CHURN = .4;
/** How long before landing a glyph shows at full strength, in ms: the bright edge of the wave. */
const NEAR = 260;

/**
 * Decodes the text inside its host as it comes on screen: each letter and digit shows a
 * flickering glyph (decode-text.ts), then the real ones land in a soft wave from the first to the
 * last. Spaces, punctuation and emoji stay as they are, so the words keep their shape.
 *
 * The host's text itself is never touched: while it decodes it is only not painted
 * (.is-decoding in src/scss/_motion.scss), so its layout, and what screen readers read, stay as
 * they are. An overlay draws each character where the text has it instead, measured from the
 * text, and is taken away once every letter has landed. Splitting the text into a span per letter
 * would be simpler, but the browser doesn't kern across elements, so lines would shift by a
 * fraction of a pixel and could wrap differently while the text decodes. Elements marked
 * aria-hidden are left alone. Don't nest one decoding host inside another.
 *
 * Text already on screen when the page opens scrambles before it shows and lands after
 * `decodeDelay`. Text further down scrambles just before it scrolls into view and lands at once.
 * With reduced motion, or without IntersectionObserver, the text is simply there.
 */
@Directive({
  selector: '[appDecode]',
  standalone: true
})
export class DecodeDirective {
  /** For text on screen when the page opens: wait before landing, in ms, to follow what is above it. */
  readonly decodeDelay = input(0);
  /** How long the landing takes, in ms. By default it depends on the length (decodeDurationFor). */
  readonly decodeDuration = input<number | undefined>(undefined);

  constructor() {
    if (typeof IntersectionObserver === 'undefined' || typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
      return;
    }

    const host: HTMLElement = inject(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    let decoding: Decoding | undefined;
    destroyRef.onDestroy(() => decoding?.stop());

    afterNextRender({
      // Every host on screen is measured before any of them adds its overlay, so the page is laid
      // out once for all of them.
      earlyRead: () => (host.getBoundingClientRect().top < window.innerHeight ? measure(host) : null),
      write: (layout) => {
        if (layout) {
          decoding = new Decoding(host, layout, this.decodeDelay(), this.decodeDuration());
          return;
        }
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) {
            observer.disconnect();
            decoding = new Decoding(host, measure(host), 0, this.decodeDuration());
          }
        }, { rootMargin: '0px 0px 10% 0px' });
        observer.observe(host);
        destroyRef.onDestroy(() => observer.disconnect());
      }
    });
  }
}

/** One character of the overlay, in px from the host's padding box. */
interface OverlayChar {
  /** As it shows, text-transform applied. */
  text: string;
  scramble: boolean;
  x: number;
  y: number;
  height: number;
  /** Where it sits in its element, for a background-clip: text fill to line up. */
  fillX: number;
  fillY: number;
}

/** The characters of one text node, and how its element draws them. */
interface OverlayRun {
  style: Pick<CSSStyleDeclaration, 'color' | 'fontFamily' | 'fontSize' | 'fontStyle' | 'fontVariantNumeric' | 'fontWeight'>;
  /** The element's text fill, when its text is filled by a background-clip: text image. */
  fill: { image: string; width: number; height: number } | null;
  chars: OverlayChar[];
}

interface Layout {
  runs: OverlayRun[];
  /** Elements whose text is a background-clip: text fill, which `text-fill-color` doesn't hide. */
  filled: HTMLElement[];
  hostIsStatic: boolean;
}

/** Where the host's text has each character. Reads only, so measuring many hosts lays out once. */
function measure(host: HTMLElement): Layout {
  const box = host.getBoundingClientRect();
  // Rects include any transform on the way (a box rising in, say); the overlay is drawn inside
  // the host, under the same transform, so it wants the positions without it.
  const scaleX = box.width / host.offsetWidth || 1;
  const scaleY = box.height / host.offsetHeight || 1;
  const left = box.left + host.clientLeft * scaleX;
  const top = box.top + host.clientTop * scaleY;
  const range = document.createRange();
  const runs: OverlayRun[] = [];
  const filled = new Set<HTMLElement>();

  for (const text of decodableTexts(host)) {
    const element = text.parentElement as HTMLElement;
    const style = getComputedStyle(element);
    const elementBox = element.getBoundingClientRect();
    const clip = clippingBox(element, host);
    const isFilled = style.backgroundClip === 'text' || style.getPropertyValue('-webkit-background-clip') === 'text';
    // A ::first-letter can case the first character differently from the rest.
    let transform = firstText(element) === text
      ? getComputedStyle(element, '::first-letter').textTransform
      : style.textTransform;

    const chars: OverlayChar[] = [];
    let offset = 0;
    for (const char of graphemes(text.data)) {
      const start = offset;
      offset += char.length;
      if (!char.trim()) {
        continue;
      }
      range.setStart(text, start);
      range.setEnd(text, offset);
      const rect = range.getBoundingClientRect();
      const shown = transformed(char, transform);
      transform = style.textTransform;
      // Cut off (an ellipsis): the text doesn't show it, so neither does the overlay.
      if (!rect.width || (clip && (rect.left < clip.left - .5 || rect.right > clip.right + .5))) {
        continue;
      }
      chars.push({
        text: shown,
        scramble: isDecodable(char),
        x: (rect.left - left) / scaleX,
        y: (rect.top - top) / scaleY,
        height: rect.height / scaleY,
        fillX: (rect.left - elementBox.left) / scaleX,
        fillY: (rect.top - elementBox.top) / scaleY
      });
    }

    if (isFilled) {
      filled.add(element);
    }
    runs.push({
      style: {
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontStyle: style.fontStyle,
        fontVariantNumeric: style.fontVariantNumeric,
        fontWeight: style.fontWeight
      },
      fill: isFilled
        ? { image: style.backgroundImage, width: elementBox.width / scaleX, height: elementBox.height / scaleY }
        : null,
      chars
    });
  }

  return { runs, filled: [...filled], hostIsStatic: getComputedStyle(host).position === 'static' };
}

/** One decode of a host's text: the overlay built, its letters landed, then taken away. */
class Decoding {
  private readonly overlay = document.createElement('span');
  /** The overlay's letters still to land, with the character each one lands on. */
  private readonly letters: { glyph: HTMLElement; text: string }[] = [];
  /** Undoes what was done to the page for the decode. */
  private readonly undo: (() => void)[] = [];
  private frame = 0;
  private readonly onResize = () => this.stop();

  constructor(host: HTMLElement, layout: Layout, delay: number, duration: number | undefined) {
    this.overlay.className = 'decode-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    for (const run of layout.runs) {
      this.overlay.append(this.drawRun(run));
    }
    if (!this.letters.length) {
      return;
    }

    if (layout.hostIsStatic) {
      this.extend(host, 'style', 'position: relative');
    }
    for (const element of layout.filled) {
      this.extend(element, 'style', 'visibility: hidden');
    }
    this.extend(host, 'class', 'is-decoding');
    host.append(this.overlay);
    this.undo.push(() => this.overlay.remove());
    // The overlay is measured for this layout; a new one would leave it out of place.
    window.addEventListener('resize', this.onResize);
    this.undo.push(() => window.removeEventListener('resize', this.onResize));

    this.play(delay, duration ?? decodeDurationFor(this.letters.length));
  }

  /** Shows the host's own text again, decoded or not. */
  stop(): void {
    cancelAnimationFrame(this.frame);
    for (const undo of this.undo.splice(0).reverse()) {
      undo();
    }
  }

  private drawRun(run: OverlayRun): HTMLElement {
    const element = document.createElement('span');
    element.className = run.fill ? 'decode-run is-filled' : 'decode-run';
    Object.assign(element.style, run.style);
    if (run.fill) {
      element.style.backgroundImage = run.fill.image;
    }
    for (const char of run.chars) {
      const glyph = document.createElement('span');
      glyph.className = char.scramble ? 'decode-glyph is-scrambled' : 'decode-glyph';
      glyph.textContent = char.scramble ? randomGlyph(char.text) : char.text;
      glyph.style.cssText = `left:${char.x}px;top:${char.y}px;height:${char.height}px;line-height:${char.height}px`
        + (run.fill
          ? `;background-size:${run.fill.width}px ${run.fill.height}px;background-position:${-char.fillX}px ${-char.fillY}px`
          : '');
      element.append(glyph);
      if (char.scramble) {
        this.letters.push({ glyph, text: char.text });
      }
    }
    return element;
  }

  /**
   * Adds to an element's class or style, to be put back exactly as it was (or taken away). Through
   * the attribute rather than element.style: the browser writes a change made through element.style
   * back to the attribute lazily, and after the attribute is taken away would leave style="".
   */
  private extend(element: HTMLElement, attribute: 'class' | 'style', addition: string): void {
    const before = element.getAttribute(attribute);
    element.setAttribute(attribute, before ? `${before}${attribute === 'class' ? ' ' : '; '}${addition}` : addition);
    this.undo.push(() => {
      if (before === null) {
        element.removeAttribute(attribute);
      } else {
        element.setAttribute(attribute, before);
      }
    });
  }

  private play(delay: number, duration: number): void {
    const lands = landingTimes(this.letters.length, duration).map(time => time + delay);
    // The letters in the order they land: the first `landed` have, the first `near` are about to.
    const order = this.letters.map((_, index) => index).sort((a, b) => lands[a] - lands[b]);
    let landed = 0;
    let near = 0;
    let tick = -1;
    let start: number | undefined;

    const step = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      for (; near < order.length && lands[order[near]] - NEAR <= elapsed; near++) {
        this.letters[order[near]].glyph.classList.add('is-near');
      }
      for (; landed < order.length && lands[order[landed]] <= elapsed; landed++) {
        const { glyph, text } = this.letters[order[landed]];
        glyph.textContent = text;
        glyph.className = 'decode-glyph';
      }
      if (landed === order.length) {
        this.stop();
        return;
      }
      if (Math.floor(elapsed / GLYPH_TICK) !== tick) {
        tick = Math.floor(elapsed / GLYPH_TICK);
        for (let index = landed; index < order.length; index++) {
          const letter = this.letters[order[index]];
          if (Math.random() < GLYPH_CHURN) {
            letter.glyph.textContent = randomGlyph(letter.text);
          }
        }
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}

/** The host's text nodes with something to read, outside anything aria-hidden. */
function decodableTexts(host: HTMLElement): Text[] {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeValue?.trim() && !node.parentElement?.closest('[aria-hidden="true"], svg')
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT)
  });
  const texts: Text[] = [];
  while (walker.nextNode()) {
    texts.push(walker.currentNode as Text);
  }
  return texts;
}

/** The element's first text with something to read: where a ::first-letter would fall. */
function firstText(element: HTMLElement): Text | undefined {
  return Array.from(element.childNodes).find((node): node is Text => node instanceof Text && !!node.data.trim());
}

/** The box of the nearest element between `element` and the host that cuts off what overflows it. */
function clippingBox(element: HTMLElement, host: HTMLElement): DOMRect | null {
  for (let current: HTMLElement | null = element; current && current !== host; current = current.parentElement) {
    if (getComputedStyle(current).overflowX !== 'visible') {
      return current.getBoundingClientRect();
    }
  }
  return null;
}
