// Playwright 테스트 전용 번들 진입점: 앱 번들(dist)에는 들어가지 않는다. calendar-image.spec.ts가 vite로 따로 묶어 페이지에 주입한다.
import { buildCalendarImageModel, readPngSize } from '../../src/features/record/calendarImage';
import { SystemClock } from '../../src/core/time/SystemClock';
import { CanvasCalendarImageExporter } from '../../src/features/record/CalendarImageExporter';
import { AnchorFileDownloader } from '../../src/features/record/FileDownloader';
import type { CalendarPost } from '../../src/features/record/recordModels';
import { ObjectUrlFactory } from '../../src/features/signature/BlobUrlFactory';

export type Rgb = [number, number, number];

export interface PostSpec {
  topicDate: string;
  status: 'PENDING' | 'APPROVED';
  /** 단색 썸네일. 'broken'이면 읽을 수 없는 이미지 URL(그 칸은 날짜만 그려야 한다). */
  thumbnail: Rgb | 'broken';
}

export interface RenderReport {
  type: string;
  size: { width: number; height: number } | null;
  decoded: { width: number; height: number };
  signature: number[];
  /** 요청한 좌표의 RGBA. */
  pixels: [number, number, number, number][];
}

/** 단색 PNG data URL(외부 네트워크 없이 썸네일을 대신한다). */
function solidDataUrl([r, g, b]: Rgb): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d')!;
  context.fillStyle = `rgb(${r}, ${g}, ${b})`;
  context.fillRect(0, 0, 32, 32);
  return canvas.toDataURL('image/png');
}

function postsOf(ym: { year: number; month: number }, specs: PostSpec[]): CalendarPost[] {
  return specs.map((spec, index) => ({
    postId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    topicDate: spec.topicDate,
    status: spec.status,
    thumbnailImageUrl: spec.thumbnail === 'broken' ? 'data:image/png;base64,AAAA' : solidDataUrl(spec.thumbnail),
  })).filter((post) => post.topicDate.startsWith(`${ym.year}-${String(ym.month).padStart(2, '0')}`));
}

async function render(ym: { year: number; month: number }, specs: PostSpec[]): Promise<Blob> {
  return new CanvasCalendarImageExporter({ clock: new SystemClock() }).render(buildCalendarImageModel(ym, postsOf(ym, specs)));
}

/** 실제 canvas로 달력을 그려 PNG 형식·크기를 확인하고, 디코드한 결과의 지정 좌표 색을 돌려준다. */
export async function renderCalendar(ym: { year: number; month: number }, specs: PostSpec[], points: [number, number][]): Promise<RenderReport> {
  const blob = await render(ym, specs);
  const size = await readPngSize(blob);
  const signature = Array.from(new Uint8Array(await blob.slice(0, 8).arrayBuffer()));
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  const pixels = points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data) as [number, number, number, number]);
  return { type: blob.type, size, decoded: { width: bitmap.width, height: bitmap.height }, signature, pixels };
}

/** 그린 PNG를 실제 `<a download>`로 내려받게 한다(브라우저의 download 이벤트는 테스트가 기다린다). */
export async function downloadCalendar(ym: { year: number; month: number }, specs: PostSpec[], name: string): Promise<void> {
  const blob = await render(ym, specs);
  await new AnchorFileDownloader({ blobUrls: new ObjectUrlFactory(), clock: new SystemClock() }).download({ name, blob });
}
