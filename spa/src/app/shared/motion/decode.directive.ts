import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { decodeDurationFor, graphemes, isDecodable, landingTimes, randomGlyph, transformed } from './decode-text';
import { prefersReducedMotion } from './motion';

const GLYPH_TICK = 80;
const GLYPH_CHURN = .4;
const NEAR = 260;

@Directive({
  selector: '[appDecode]',
})
export class DecodeDirective {
  readonly decodeDelay = input(0);
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

interface OverlayChar {
  text: string;
  scramble: boolean;
  x: number;
  y: number;
  height: number;
  fillX: number;
  fillY: number;
}

interface OverlayRun {
  style: Pick<CSSStyleDeclaration, 'color' | 'fontFamily' | 'fontSize' | 'fontStyle' | 'fontVariantNumeric' | 'fontWeight'>;
  fill: { image: string; width: number; height: number } | null;
  chars: OverlayChar[];
}

interface Layout {
  runs: OverlayRun[];
  filled: HTMLElement[];
  hostIsStatic: boolean;
}

function measure(host: HTMLElement): Layout {
  const box = host.getBoundingClientRect();
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

class Decoding {
  private readonly overlay = document.createElement('span');
  private readonly letters: { glyph: HTMLElement; text: string }[] = [];
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
    window.addEventListener('resize', this.onResize);
    this.undo.push(() => window.removeEventListener('resize', this.onResize));

    this.play(delay, duration ?? decodeDurationFor(this.letters.length));
  }

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

function firstText(element: HTMLElement): Text | undefined {
  return Array.from(element.childNodes).find((node): node is Text => node instanceof Text && !!node.data.trim());
}

function clippingBox(element: HTMLElement, host: HTMLElement): DOMRect | null {
  for (let current: HTMLElement | null = element; current && current !== host; current = current.parentElement) {
    if (getComputedStyle(current).overflowX !== 'visible') {
      return current.getBoundingClientRect();
    }
  }
  return null;
}
