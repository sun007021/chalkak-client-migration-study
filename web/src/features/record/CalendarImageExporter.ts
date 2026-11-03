import type { CalendarImageModel } from './calendarImage';

/**
 * 달력을 PNG Blob 한 장으로 그리는 포트. 렌더 방식(Web은 canvas)은 구현 소관이고 결과는 image/png여야 한다.
 * 기본 구현은 canvas이며 실제 그리기는 jsdom이 아니라 Playwright(Chromium)로 확인한다. 테스트는 Fake를 주입한다.
 */
export interface CalendarImageExporter {
  render(model: CalendarImageModel, signal?: AbortSignal): Promise<Blob>;
}

const WIDTH = 1080;
const PADDING = 50;
const CELL = Math.floor((WIDTH - PADDING * 2) / 7);
const GRID_LEFT = Math.floor((WIDTH - CELL * 7) / 2);
const TITLE_HEIGHT = 120;
const WEEKDAY_HEIGHT = 56;
const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
const INK = '#111111';
const MUTED = '#8a8a8a';
const EMPTY_FILL = '#f2f2f2';

const aborted = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

/** 썸네일을 읽는다. canvas를 오염시키지 않도록 CORS 모드로 읽고, 실패하면 null(그 칸은 날짜만 그린다). */
function loadThumbnail(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const done = (value: HTMLImageElement | null) => {
      signal?.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const onAbort = () => {
      image.src = '';
      done(null);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    image.onload = () => done(image);
    image.onerror = () => done(null);
    image.src = url;
  });
}

/** 칸을 꽉 채우도록(비율 유지, 가운데) 잘라 그린다. */
function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number): void {
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (side <= 0) return;
  const sx = (image.naturalWidth - side) / 2;
  const sy = (image.naturalHeight - side) / 2;
  context.drawImage(image, sx, sy, side, side, x, y, size, size);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, size: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + size, y, x + size, y + size, radius);
  context.arcTo(x + size, y + size, x, y + size, radius);
  context.arcTo(x, y + size, x, y, radius);
  context.arcTo(x, y, x + size, y, radius);
  context.closePath();
}

/** 실제 canvas 구현. 썸네일을 불러오지 못한 칸은 날짜만 그린다(그리기 전체를 실패시키지 않는다). */
export class CanvasCalendarImageExporter implements CalendarImageExporter {
  async render(model: CalendarImageModel, signal?: AbortSignal): Promise<Blob> {
    if (signal?.aborted) throw aborted();
    const rows = model.cells.length / 7;
    const width = WIDTH;
    const height = PADDING + TITLE_HEIGHT + WEEKDAY_HEIGHT + rows * CELL + PADDING;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d context is not available');

    const thumbnails = await Promise.all(model.cells.map((cell) => (cell?.thumbnailUrl ? loadThumbnail(cell.thumbnailUrl, signal) : Promise.resolve(null))));
    if (signal?.aborted) throw aborted();

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    context.fillStyle = INK;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 56px ${FONT}`;
    context.fillText(model.title, width / 2, PADDING + TITLE_HEIGHT / 2);

    context.font = `500 28px ${FONT}`;
    context.fillStyle = MUTED;
    model.weekdays.forEach((weekday, column) => {
      context.fillText(weekday, GRID_LEFT + column * CELL + CELL / 2, PADDING + TITLE_HEIGHT + WEEKDAY_HEIGHT / 2);
    });

    const gridTop = PADDING + TITLE_HEIGHT + WEEKDAY_HEIGHT;
    const inset = 4;
    const size = CELL - inset * 2;
    model.cells.forEach((cell, index) => {
      if (!cell) return;
      const x = GRID_LEFT + (index % 7) * CELL + inset;
      const y = gridTop + Math.floor(index / 7) * CELL + inset;
      const image = thumbnails[index] ?? null;
      context.save();
      roundedRect(context, x, y, size, 12);
      context.clip();
      context.fillStyle = EMPTY_FILL;
      context.fillRect(x, y, size, size);
      if (image) drawCover(context, image, x, y, size);
      if (cell.pending) {
        context.fillStyle = 'rgba(255, 255, 255, 0.55)';
        context.fillRect(x, y, size, size);
      }
      context.restore();
      // 날짜: 사진 위에서도 읽히도록 흰 바탕 알약 위에 그린다.
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.font = `600 24px ${FONT}`;
      if (image) {
        context.fillStyle = 'rgba(255, 255, 255, 0.85)';
        context.fillRect(x, y, 14 + context.measureText(String(cell.day)).width + 14, 38);
      }
      context.fillStyle = image ? INK : MUTED;
      context.fillText(String(cell.day), x + 14, y + 7);
    });

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
    });
  }
}
