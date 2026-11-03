import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * 실제 Chromium에서 BrowserImageDecoder + CanvasWebpCompressor로 업로드 사진을 인코딩해 본다(jsdom에는 canvas·createImageBitmap이 없다).
 * 테스트 전용 진입점(e2e/fixtures/encoderEntry.ts)을 vite로 따로 묶어 페이지에 주입하므로 앱 번들(dist)에는 테스트 코드가 들어가지 않는다.
 * 대상: TC-UPL-032/033(image/webp·RIFF/WEBP·EXIF 없음), 034/035(4096 상한·목표 크기 디코드), 036(EXIF 방향), 037~039(품질 사다리·크기 상한), 044(PNG·JPEG 입력).
 */
let bundle = '';

test.beforeAll(async () => {
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    root: fileURLToPath(new URL('..', import.meta.url)),
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('./fixtures/encoderEntry.ts', import.meta.url)), name: 'EncoderFixture', formats: ['iife'], fileName: 'encoder-fixture' },
    },
  })) as Rollup.RolldownOutput | Rollup.RolldownOutput[];
  const first = (Array.isArray(output) ? output[0]! : output).output.find((chunk) => chunk.type === 'chunk');
  if (!first || first.type !== 'chunk') throw new Error('encoder fixture bundle was not produced');
  bundle = first.code;
});

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    const scope = window as unknown as Record<string, unknown>;
    // 이 페이지 안에서 쓰는 도구: 소스 이미지를 canvas로 만든다.
    scope['makeSource'] = async (kind: 'png' | 'jpeg', width: number, height: number, noise: boolean): Promise<Blob> => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d')!;
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#d94a4a');
      gradient.addColorStop(1, '#3a6ad9');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      if (noise) {
        const data = context.getImageData(0, 0, width, height);
        for (let i = 0; i < data.data.length; i += 4) {
          data.data[i] = Math.floor(Math.random() * 256);
          data.data[i + 1] = Math.floor(Math.random() * 256);
          data.data[i + 2] = Math.floor(Math.random() * 256);
        }
        context.putImageData(data, 0, 0);
      }
      // 왼쪽 위 모서리 표식(방향 확인용).
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, Math.max(2, Math.floor(width / 8)), Math.max(2, Math.floor(height / 8)));
      return canvas.convertToBlob({ type: `image/${kind}`, quality: 0.9 });
    };
    // JPEG에 EXIF 방향(Orientation) APP1 세그먼트를 끼워 넣는다.
    scope['withOrientation'] = async (jpeg: Blob, orientation: number): Promise<Blob> => {
      const src = new Uint8Array(await jpeg.arrayBuffer());
      const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
      const length = payload.length + 2;
      const segment = [0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload];
      return new Blob([src.slice(0, 2), new Uint8Array(segment), src.slice(2)], { type: 'image/jpeg' });
    };
  });
}

type Fixture = typeof import('./fixtures/encoderEntry');

/** 페이지 안에서 소스를 만들고 fixture 함수에 넘긴다. */
async function run<T>(page: Page, make: string, call: 'encodeFile' | 'decodeSize' | 'decodeFailure' | 'canvasProducesWebp', ...args: unknown[]): Promise<T> {
  return page.evaluate(
    async ([makeExpr, name, extra]) => {
      const scope = window as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const source: Blob = await new Function('scope', `return (async () => { const { makeSource, withOrientation } = scope; return ${makeExpr}; })()`)(scope);
      const fixture = scope['EncoderFixture'] as Record<string, (...a: unknown[]) => Promise<unknown>>;
      return fixture[name as string]!(source, ...(extra as unknown[]));
    },
    [make, call, args] as const,
  ) as Promise<T>;
}

test.describe('업로드 사진 인코딩 (Chromium 실제 canvas)', () => {
  test.beforeEach(async ({ page }) => open(page));

  for (const kind of ['png', 'jpeg'] as const) {
    test(`TC-UPL-032 TC-UPL-044 ${kind} 입력이 image/webp RIFF/WEBP 정지 이미지로 인코딩되고 EXIF·XMP·ICC가 없다`, async ({ page }) => {
      const report = await run<Awaited<ReturnType<Fixture['encodeFile']>>>(page, `makeSource('${kind}', 800, 600, false)`, 'encodeFile');
      expect(report.type).toBe('image/webp');
      expect(report.header).toBe('RIFF');
      expect(report.form).toBe('WEBP');
      expect(report.inspection.ok).toBe(true);
      if (report.inspection.ok) expect(report.inspection.chunks.some((id) => ['EXIF', 'XMP ', 'ICCP', 'ANIM', 'ANMF'].includes(id))).toBe(false);
      expect(report.size).toBeLessThanOrEqual(5_242_880);
      expect(report.decodedWidth).toBe(800);
      expect(report.decodedHeight).toBe(600);
      expect(report.width).toBe(800);
      expect(report.height).toBe(600);
      expect(report.quality).toBe(90);
    });
  }

  test('TC-UPL-034 TC-UPL-035 긴 변이 4096을 넘는 소스는 디코드 단계에서 4096으로 줄어 비율이 유지된다', async ({ page }) => {
    const size = await run<{ width: number; height: number }>(page, `makeSource('png', 5000, 3000, false)`, 'decodeSize', 4096);
    expect(size).toEqual({ width: 4096, height: 2458 });
  });

  test('TC-UPL-034 4096 이하의 소스는 확대하지 않는다', async ({ page }) => {
    const size = await run<{ width: number; height: number }>(page, `makeSource('png', 640, 480, false)`, 'decodeSize', 4096);
    expect(size).toEqual({ width: 640, height: 480 });
  });

  for (const [orientation, width, height] of [
    [1, 64, 32],
    [3, 64, 32],
    [6, 32, 64],
    [8, 32, 64],
  ] as const) {
    test(`TC-UPL-036 EXIF 방향 ${orientation}을 반영한 보이는 방향의 크기(${width}x${height})로 디코드하고 출력에는 방향 태그가 없다`, async ({ page }) => {
      const make = `withOrientation(await makeSource('jpeg', 64, 32, false), ${orientation})`;
      const size = await run<{ width: number; height: number }>(page, make, 'decodeSize', 4096);
      expect(size).toEqual({ width, height });
      const report = await run<Awaited<ReturnType<Fixture['encodeFile']>>>(page, make, 'encodeFile');
      expect(report.inspection.ok).toBe(true);
      expect(report.width).toBe(width);
      expect(report.height).toBe(height);
    });
  }

  test('TC-UPL-037 TC-UPL-038 TC-UPL-039 잡음이 많은 큰 사진은 품질을 낮추거나 줄여서 정책 크기 상한 이하가 된다', async ({ page }) => {
    const maxBytes = 150_000;
    const report = await run<Awaited<ReturnType<Fixture['encodeFile']>>>(page, `makeSource('png', 1600, 1200, true)`, 'encodeFile', maxBytes);
    expect(report.type).toBe('image/webp');
    expect(report.size).toBeLessThanOrEqual(maxBytes);
    expect(report.attempts).toBeGreaterThan(1);
    expect(report.inspection.ok).toBe(true);
  });

  test('TC-UPL-042 불가능한 크기 상한이면 SizeLimitExceededError이고 다른 형식으로 대신하지 않는다', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const scope = window as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const source: Blob = await scope['makeSource']('png', 800, 600, true);
      try {
        await scope['EncoderFixture'].encodeFile(source, 1_000);
        return 'resolved';
      } catch (error) {
        return (error as Error).name;
      }
    });
    expect(result).toBe('SizeLimitExceededError');
  });

  test('TC-UPL-032 canvas가 직접 image/webp를 돌려준다', async ({ page }) => {
    expect(await run<string>(page, `makeSource('png', 64, 64, false)`, 'canvasProducesWebp')).toBe('image/webp');
  });

  test('TC-UPL-021 비어 있거나 이미지가 아닌 파일은 ImageDecodeError다', async ({ page }) => {
    expect(await run<string>(page, `new Blob([], { type: 'image/jpeg' })`, 'decodeFailure')).toBe('ImageDecodeError');
    expect(await run<string>(page, `new Blob([new Uint8Array(64).fill(7)], { type: 'image/jpeg' })`, 'decodeFailure')).toBe('ImageDecodeError');
  });
});
