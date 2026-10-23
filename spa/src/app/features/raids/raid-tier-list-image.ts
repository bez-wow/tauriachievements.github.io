import { DIFFICULTY_COLORS } from './raid-display';
import { SPEC_TOP_SCORES } from './raid-scores';
import { FEW_PLAYERS, RoleTierList, TierSpec, describeTiers } from './raid-tier-list';

export interface TierListImageInfo {
  raidName: string;
  raidSlug: string;
  difficultySlug: string;
  difficultyName: string;
  date: Date;
}

export interface TablePlacement {
  list: RoleTierList;
  x: number;
  top: number;
  width: number;
  columns: number;
}

export interface ImageLayout {
  width: number;
  tables: TablePlacement[];
  bottom: number;
  footer: string[];
}

const SCALE = 2;
const PADDING = 36;
const TILE = 80;
const LABEL_WIDTH = 100;
const MIN_COLUMNS = 6;
const MAX_COLUMNS = 12;
const HEADER_HEIGHT = 108;
const HEADING_HEIGHT = 34;
const SECTION_GAP = 32;
const TABLE_GAP = 28;
const FOOTER_GAP = 30;
const FOOTER_LINE = 19;
const FONT = 'Arial, Helvetica, sans-serif';
const GOLD = '#f7b500';
const TEXT = '#e0e0e0';
const MUTED = '#9a9a9a';
const INK = '#1a1a17';
const KICKER = 'TAURI LEGION · RAID LOGS';
const TITLE = 'Spec Tier List';
const SITE = 'tauriachievements.github.io';

export function imageColumns(list: RoleTierList): number {
  const widest = Math.max(0, ...list.rows.map(row => row.specs.length));
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, widest));
}

function tableWidth(columns: number): number {
  return 2 + LABEL_WIDTH + columns * TILE;
}

function columnsIn(width: number): number {
  return Math.floor((width - 2 - LABEL_WIDTH) / TILE);
}

function rowHeight(specCount: number, columns: number): number {
  return TILE * Math.max(1, Math.ceil(specCount / columns));
}

function tableHeight(list: RoleTierList, columns: number): number {
  return list.rows.reduce((height, row) => height + rowHeight(row.specs.length, columns) + 1, 1);
}

export function formatImageDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function localDay(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, '0')).join('-');
}

export function tierListImageName(info: TierListImageInfo): string {
  return `${info.raidSlug}-${info.difficultySlug}-tier-list-${localDay(info.date)}.png`;
}

function characters(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'character' : 'characters'}`;
}

export function imageFooter(lists: readonly RoleTierList[]): string[] {
  const fewPlayers = lists.some(list => list.rows.some(row => row.specs.some(spec => spec.fewPlayers)));
  const unplayed = lists.flatMap(list => list.unplayed);
  return [
    `Each spec's top ${SPEC_TOP_SCORES} scores, averaged: HPS for healers, DPS for everyone else. Tier by share of the best spec in its role: ${describeTiers()}.`,
    ...(fewPlayers ? [`A number on an icon: fewer than ${FEW_PLAYERS} characters played it.`] : []),
    ...(unplayed.length ? [`Not played: ${unplayed.join(', ')}.`] : [])
  ];
}

export function imageLayout(lists: readonly RoleTierList[]): ImageLayout {
  const [wide, ...rest] = lists;
  const gaps = TABLE_GAP * Math.max(0, rest.length - 1);
  const restWidth = rest.reduce((sum, list) => sum + tableWidth(imageColumns(list)), gaps);
  const contentWidth = Math.max(tableWidth(imageColumns(wide)), restWidth);

  const wideTop = PADDING + HEADER_HEIGHT + HEADING_HEIGHT;
  const wideColumns = columnsIn(contentWidth);
  const wideBottom = wideTop + tableHeight(wide, wideColumns);
  const tables: TablePlacement[] = [{ list: wide, x: PADDING, top: wideTop, width: contentWidth, columns: wideColumns }];

  let bottom = wideBottom;
  if (rest.length) {
    const width = Math.floor((contentWidth - gaps) / rest.length);
    const top = wideBottom + SECTION_GAP + HEADING_HEIGHT;
    rest.forEach((list, index) => {
      const columns = columnsIn(width);
      tables.push({ list, x: PADDING + index * (width + TABLE_GAP), top, width, columns });
      bottom = Math.max(bottom, top + tableHeight(list, columns));
    });
  }

  return { width: PADDING * 2 + contentWidth, tables, bottom, footer: imageFooter(lists) };
}

export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  return line ? [...lines, line] : lines;
}

async function loadImage(document: Document, src: string): Promise<HTMLImageElement | undefined> {
  const image = document.createElement('img');
  image.src = src;
  try {
    await image.decode();
    return image;
  } catch {
    return undefined;
  }
}

function drawHeader(context: CanvasRenderingContext2D, width: number, info: TierListImageInfo): void {
  const right = width - PADDING;

  context.fillStyle = GOLD;
  context.fillRect(0, 0, width, 4);

  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.font = `700 13px ${FONT}`;
  context.fillText(KICKER, PADDING, PADDING + 12);
  context.textAlign = 'right';
  context.fillText(SITE, right, PADDING + 12);
  context.textAlign = 'left';

  context.fillStyle = '#fff';
  context.font = `700 34px ${FONT}`;
  context.fillText(TITLE, PADDING, PADDING + 52);

  context.font = `17px ${FONT}`;
  context.fillStyle = TEXT;
  context.fillText(info.raidName, PADDING, PADDING + 82);
  const dotX = PADDING + context.measureText(info.raidName).width + 18;
  context.fillStyle = DIFFICULTY_COLORS[info.difficultySlug] ?? TEXT;
  context.beginPath();
  context.arc(dotX, PADDING + 76, 5, 0, Math.PI * 2);
  context.fill();
  context.font = `700 17px ${FONT}`;
  context.fillText(info.difficultyName, dotX + 12, PADDING + 82);

  context.textAlign = 'right';
  context.fillStyle = TEXT;
  context.font = `15px ${FONT}`;
  context.fillText(formatImageDate(info.date), right, PADDING + 52);
}

function drawHeading(context: CanvasRenderingContext2D, table: TablePlacement): void {
  const baseline = table.top - 12;
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = '#fff';
  context.font = `700 20px ${FONT}`;
  context.fillText(table.list.title, table.x, baseline);
  context.textAlign = 'right';
  context.fillStyle = MUTED;
  context.font = `13px ${FONT}`;
  context.fillText(characters(table.list.characterCount), table.x + table.width, baseline);
}

function drawBadge(context: CanvasRenderingContext2D, count: number, tileX: number, tileY: number): void {
  context.font = `700 12px ${FONT}`;
  const text = String(count);
  const width = Math.max(18, context.measureText(text).width + 10);
  const height = 17;
  const x = tileX + TILE - 3 - width;
  const y = tileY + TILE - 3 - height;

  context.beginPath();
  context.roundRect(x, y, width, height, height / 2);
  context.fillStyle = 'rgba(0, 0, 0, .82)';
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, .3)';
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, x + width / 2, y + height / 2 + 1);
}

function drawTable(context: CanvasRenderingContext2D, table: TablePlacement, images: ReadonlyMap<number, HTMLImageElement | undefined>): void {
  const { list, x, top, width, columns } = table;
  context.fillStyle = '#000';
  context.fillRect(x, top, width, tableHeight(list, columns));

  const labelX = x + 1;
  const tilesX = labelX + LABEL_WIDTH;
  let rowTop = top + 1;
  for (const row of list.rows) {
    const height = rowHeight(row.specs.length, columns);

    context.fillStyle = row.tier.color;
    context.fillRect(labelX, rowTop, LABEL_WIDTH, height);
    context.fillStyle = INK;
    context.fillRect(tilesX, rowTop, width - 2 - LABEL_WIDTH, height);

    context.font = `700 30px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(row.tier.label, labelX + LABEL_WIDTH / 2, rowTop + height / 2 + 1);

    row.specs.forEach((spec, index) => {
      const tileX = tilesX + (index % columns) * TILE;
      const tileY = rowTop + Math.floor(index / columns) * TILE;
      const image = images.get(spec.id);
      if (image) {
        context.drawImage(image, tileX, tileY, TILE, TILE);
      } else {
        context.fillStyle = '#333';
        context.fillRect(tileX, tileY, TILE, TILE);
      }
      if (spec.fewPlayers) {
        drawBadge(context, spec.count, tileX, tileY);
      }
    });

    rowTop += height + 1;
  }
}

export async function renderTierListImage(document: Document, lists: readonly RoleTierList[], info: TierListImageInfo): Promise<Blob> {
  const layout = imageLayout(lists);
  const specs: TierSpec[] = layout.tables.flatMap(table => table.list.rows.flatMap(row => row.specs));
  const images = new Map(await Promise.all(specs.map(async spec => [spec.id, await loadImage(document, spec.art)] as const)));

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot draw the image.');
  }

  context.font = `13px ${FONT}`;
  const footer = layout.footer.flatMap(paragraph =>
    wrapText(paragraph, layout.width - PADDING * 2, text => context.measureText(text).width));
  const footerTop = layout.bottom + FOOTER_GAP;
  const height = footerTop + (footer.length - 1) * FOOTER_LINE + PADDING;

  canvas.width = layout.width * SCALE;
  canvas.height = height * SCALE;
  context.scale(SCALE, SCALE);

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#171717');
  background.addColorStop(1, '#070707');
  context.fillStyle = background;
  context.fillRect(0, 0, layout.width, height);

  drawHeader(context, layout.width, info);
  for (const table of layout.tables) {
    drawHeading(context, table);
    drawTable(context, table, images);
  }

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = MUTED;
  context.font = `13px ${FONT}`;
  footer.forEach((line, index) => context.fillText(line, PADDING, footerTop + index * FOOTER_LINE));

  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('The image could not be created.')),
    'image/png'
  ));
}

export function saveImage(document: Document, blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
