import { FakeClock } from '../../test/FakeClock';
import { pngOf } from '../../test/pngBytes';
import { buildCalendarImageModel } from './calendarImage';
import { CanvasCalendarImageExporter, THUMBNAIL_TIMEOUT_MS } from './CalendarImageExporter';
import type { RenderCanvas, RenderContext } from './CalendarImageExporter';
import type { CalendarPost } from './recordModels';

/** 그린 내용을 기록하는 가짜 2D 컨텍스트. */
class FakeContext implements RenderContext {
  fillStyle: RenderContext['fillStyle'] = '';
  textAlign: RenderContext['textAlign'] = 'left';
  textBaseline: RenderContext['textBaseline'] = 'alphabetic';
  font = '';
  readonly texts: string[] = [];
  readonly images: number[] = [];
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  arcTo(): void {}
  closePath(): void {}
  clip(): void {}
  fillRect(): void {}
  fillText(text: string): void {
    this.texts.push(text);
  }
  measureText(): TextMetrics {
    return { width: 10 } as TextMetrics;
  }
  drawImage(): void {
    this.images.push(1);
  }
}

class FakeCanvas implements RenderCanvas {
  width = 0;
  height = 0;
  readonly context = new FakeContext();
  getContext(): RenderContext {
    return this.context;
  }
  toBlob(callback: BlobCallback): void {
    callback(pngOf(this.width, this.height));
  }
}

const posts: CalendarPost[] = [{ postId: 'p1', topicDate: '2026-10-20', thumbnailImageUrl: 'https://cdn.example.test/a.webp', status: 'APPROVED' }];

function setup(timeoutMs?: number) {
  const clock = new FakeClock();
  const canvases: FakeCanvas[] = [];
  const images: HTMLImageElement[] = [];
  const exporter = new CanvasCalendarImageExporter({
    clock,
    thumbnailTimeoutMs: timeoutMs,
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    },
    // jsdom은 이미지를 읽지 않으므로 load/error가 오지 않는 "느린 CDN"이 된다.
    createImage: () => {
      const image = document.createElement('img');
      images.push(image);
      return image;
    },
  });
  return { clock, canvases, images, exporter, model: buildCalendarImageModel({ year: 2026, month: 10 }, posts) };
}

describe('CanvasCalendarImageExporter (가짜 canvas·이미지로 jsdom에서 확인)', () => {
  it('썸네일이 시간 안에 오지 않으면 그 칸은 날짜만 그리고 그리기는 끝난다', async () => {
    const h = setup();
    const rendering = h.exporter.render(h.model);
    let done = false;
    void rendering.then(() => (done = true));
    await h.clock.advance(THUMBNAIL_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await h.clock.advance(1);
    const blob = await rendering;
    expect(blob.type).toBe('image/png');
    expect(h.canvases[0]!.context.images).toEqual([]); // 사진 없이
    expect(h.canvases[0]!.context.texts).toContain('20'); // 날짜는 그렸다
    expect(h.images[0]!.crossOrigin).toBe('anonymous');
  });

  it('썸네일을 읽으면 시간 제한 타이머를 남기지 않는다', async () => {
    const h = setup();
    const rendering = h.exporter.render(h.model);
    await h.clock.advance(0);
    const image = h.images[0]!;
    Object.defineProperty(image, 'naturalWidth', { value: 40 });
    Object.defineProperty(image, 'naturalHeight', { value: 30 });
    image.onload?.(new Event('load'));
    await rendering;
    expect(h.clock.pendingTimers).toBe(0);
    expect(h.canvases[0]!.context.images).toHaveLength(1);
  });

  it('signal이 취소되면 AbortError로 거절하고 타이머를 남기지 않는다', async () => {
    const h = setup();
    const controller = new AbortController();
    const rendering = h.exporter.render(h.model, controller.signal);
    const result = rendering.then(
      () => 'ok',
      (error: unknown) => (error as { name?: string }).name,
    );
    await h.clock.advance(100);
    controller.abort();
    expect(await result).toBe('AbortError');
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('이미 취소된 signal이면 canvas를 만들지 않는다', async () => {
    const h = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(h.exporter.render(h.model, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.canvases).toHaveLength(0);
  });

  it('다 그린 canvas는 크기를 0으로 줄여 비트맵을 놓는다', async () => {
    const h = setup(1);
    const rendering = h.exporter.render(h.model);
    await h.clock.advance(1);
    await rendering;
    expect([h.canvases[0]!.width, h.canvases[0]!.height]).toEqual([0, 0]);
  });
});
