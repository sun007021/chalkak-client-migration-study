import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { fileURLToPath } from 'node:url';
import type { PhotoEdit } from '../src/features/upload/editModel';

/**
 * 실제 Chromium canvas에서 사진 편집(회전·자르기·조정·필터)을 적용한 픽셀을 순수 함수 기대값(기하 + applyColorPipeline)과 ±2 이내로 비교하고,
 * 실제 미리보기·자동 보정 분석기·편집기 화면(포인터 끌기)을 확인한다(jsdom에는 canvas가 없다).
 * 테스트 전용 진입점(e2e/fixtures/editorEntry.ts)을 vite로 따로 묶어 페이지에 주입하므로 앱 번들(dist)에는 테스트 코드가 들어가지 않는다.
 * 대상: TC-EDIT-016/017/020(기하 크기), 024~029(조정), 039~043/046(필터·순서), 033/034(분석), 009/010 일부(실제 디코드 크기).
 */
const TOLERANCE = 2;
let bundle = '';

test.beforeAll(async () => {
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    root: fileURLToPath(new URL('..', import.meta.url)),
    build: {
      assetsInlineLimit: 10_000_000,
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('./fixtures/editorEntry.ts', import.meta.url)), formats: ['es'], fileName: 'editor-fixture' },
      rolldownOptions: { output: { codeSplitting: false } },
    },
    // 앱 번들 전용 상수(vite.config.ts의 define)를 쓰는 모듈은 이 진입점이 가져오지 않는다.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  })) as Rollup.RolldownOutput | Rollup.RolldownOutput[];
  const first = (Array.isArray(output) ? output[0]! : output).output.find((chunk) => chunk.type === 'chunk');
  if (!first || first.type !== 'chunk') throw new Error('editor fixture bundle was not produced');
  bundle = first.code;
});

async function open(page: Page): Promise<void> {
  await page.route('**/__editor-fixture.js', (route) => route.fulfill({ contentType: 'text/javascript', body: bundle }));
  await page.goto('/');
  await page.evaluate(async () => {
    const scope = window as unknown as Record<string, unknown>;
    scope['EditorFixture'] = await import('/__editor-fixture.js' as string);
    // 소스 사진: 가로·세로가 다르고(회전 구분), 위치마다 색이 달라(자르기 구분) 손실 없는 PNG로 만든다.
    scope['makeSource'] = async (width: number, height: number, solid: [number, number, number] | null): Promise<Blob> => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d')!;
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          if (solid) image.data.set([...solid, 255], i);
          else image.data.set([Math.round((x / (width - 1)) * 255), Math.round((y / (height - 1)) * 255), (x * 7 + y * 3) % 256, 255], i);
        }
      }
      context.putImageData(image, 0, 0);
      return canvas.convertToBlob({ type: 'image/png' });
    };
  });
}

type Fixture = typeof import('./fixtures/editorEntry');
const IDENTITY = { quarterTurns: 0, crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 }, filter: 'original', adjustmentLayers: { autoValues: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, blackPoint: 0, saturation: 0, warmth: 0 }, autoStrength: 0, manual: {} } } satisfies PhotoEdit;
const edit = (patch: Partial<PhotoEdit> & { manual?: PhotoEdit['adjustmentLayers']['manual'] }): PhotoEdit => {
  const { manual, ...rest } = patch;
  return { ...IDENTITY, ...rest, adjustmentLayers: { ...IDENTITY.adjustmentLayers, manual: manual ?? {} } } as PhotoEdit;
};

async function compare(page: Page, size: [number, number], value: PhotoEdit) {
  return page.evaluate(
    async ([width, height, e]) => {
      const scope = window as unknown as { makeSource: (w: number, h: number, s: null) => Promise<Blob>; EditorFixture: Fixture };
      return scope.EditorFixture.compareEdit(await scope.makeSource(width as number, height as number, null), e as PhotoEdit);
    },
    [size[0], size[1], value] as const,
  );
}

test.describe('편집 적용 픽셀 (Chromium 실제 canvas ↔ 순수 함수 기대값)', () => {
  test.beforeEach(async ({ page }) => open(page));

  for (const turns of [0, 1, 2, 3] as const) {
    test(`TC-EDIT-016 TC-EDIT-017 ${turns}번 회전하고 일부를 자른 픽셀이 기대값과 같다`, async ({ page }) => {
      const report = await compare(page, [96, 64], edit({ quarterTurns: turns, crop: { centerX: 0.4, centerY: 0.6, width: 0.5, height: 0.75 } }));
      expect([report.width, report.height]).toEqual([report.expectedWidth, report.expectedHeight]);
      expect(report.maxDiff).toBeLessThanOrEqual(TOLERANCE);
    });
  }

  test('TC-EDIT-016 자르기 없이 90도 회전하면 가로세로가 바뀐 크기가 된다', async ({ page }) => {
    const report = await compare(page, [96, 64], edit({ quarterTurns: 1 }));
    expect([report.width, report.height]).toEqual([64, 96]);
    expect(report.maxDiff).toBeLessThanOrEqual(TOLERANCE);
  });

  for (const filter of ['mono', 'warm', 'cool', 'vintage', 'vivid'] as const) {
    test(`TC-EDIT-040 TC-EDIT-043 필터 ${filter}를 입힌 결과가 기대값과 ±${TOLERANCE} 이내다`, async ({ page }) => {
      const report = await compare(page, [80, 60], edit({ filter }));
      expect(report.maxDiff).toBeLessThanOrEqual(TOLERANCE);
      expect(report.differsFromGeometryOnly).toBe(true);
    });
  }

  const adjustments: [string, PhotoEdit['adjustmentLayers']['manual']][] = [
    ['노출 +0.5', { exposure: 0.5 }],
    ['노출 -1', { exposure: -1 }],
    ['대비 +1', { contrast: 1 }],
    ['하이라이트 +1', { highlights: 1 }],
    ['그림자 +1', { shadows: 1 }],
    ['블랙 포인트 +1', { blackPoint: 1 }],
    ['블랙 포인트 -1', { blackPoint: -1 }],
    ['채도 -1', { saturation: -1 }],
    ['채도 +1', { saturation: 1 }],
    ['따뜻함 +1', { warmth: 1 }],
    ['따뜻함 -1', { warmth: -1 }],
  ];
  for (const [label, manual] of adjustments) {
    test(`TC-EDIT-024~029 조정 ${label}을 적용한 결과가 기대값과 ±${TOLERANCE} 이내다`, async ({ page }) => {
      const report = await compare(page, [80, 60], edit({ manual }));
      expect(report.maxDiff).toBeLessThanOrEqual(TOLERANCE);
      expect(report.differsFromGeometryOnly).toBe(true);
    });
  }

  test('TC-EDIT-029 TC-EDIT-046 회전·자르기·조정·필터를 모두 합친 결과가 기대값과 ±2 이내다(조정 → 필터 순서)', async ({ page }) => {
    const report = await compare(
      page,
      [120, 80],
      edit({
        quarterTurns: 3,
        crop: { centerX: 0.55, centerY: 0.45, width: 0.6, height: 0.7 },
        filter: 'vintage',
        manual: { exposure: 0.3, warmth: 0.2, saturation: 0.1, shadows: 0.2, contrast: 0.4 },
      }),
    );
    expect([report.width, report.height]).toEqual([report.expectedWidth, report.expectedHeight]);
    expect(report.maxDiff).toBeLessThanOrEqual(TOLERANCE);
    expect(report.differsFromGeometryOnly).toBe(true);
  });

  test('TC-EDIT-020 큰 사진(8000×6000)은 4096으로 줄여 읽고 중앙 25%×25%를 자르면 1024×768이다', async ({ page }) => {
    const size = await page.evaluate(async () => {
      const scope = window as unknown as { makeSource: (w: number, h: number, s: [number, number, number]) => Promise<Blob>; EditorFixture: Fixture };
      const source = await scope.makeSource(8000, 6000, [120, 90, 60]);
      const report = await scope.EditorFixture.compareEdit(source, { quarterTurns: 0, crop: { centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25 }, filter: 'mono', adjustmentLayers: { autoValues: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, blackPoint: 0, saturation: 0, warmth: 0 }, autoStrength: 0, manual: {} } });
      return { width: report.width, height: report.height, maxDiff: report.maxDiff };
    });
    expect(size).toEqual({ width: 1024, height: 768, maxDiff: expect.any(Number) });
    expect(size.maxDiff).toBeLessThanOrEqual(TOLERANCE);
  });
});

test.describe('미리보기·자동 보정 분석 (Chromium 실제 canvas)', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('REQ-EDIT-007 미리보기는 긴 변 maxLongEdge 이내로 줄여 그려지고 <img>로 읽히며 release하면 URL이 해제된다', async ({ page }) => {
    const report = await page.evaluate(async () => {
      const scope = window as unknown as { makeSource: (w: number, h: number, s: null) => Promise<Blob>; EditorFixture: Fixture };
      return scope.EditorFixture.renderPreview(await scope.makeSource(400, 200, null), {
        quarterTurns: 1,
        crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 },
        filter: 'original',
        adjustmentLayers: { autoValues: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, blackPoint: 0, saturation: 0, warmth: 0 }, autoStrength: 0, manual: {} },
      }, 100);
    });
    expect([report.width, report.height]).toEqual([50, 100]);
    expect([report.naturalWidth, report.naturalHeight]).toEqual([50, 100]);
    expect(report.src.startsWith('blob:')).toBe(true);
    expect(report.revoked).toBe(true);
  });

  test('TC-EDIT-046 미리보기도 같은 연산을 쓴다: 단색 (200,120,60)에 노출 +0.5와 흑백이면 기대 회색에 가깝다', async ({ page }) => {
    const report = await page.evaluate(async () => {
      const scope = window as unknown as { makeSource: (w: number, h: number, s: [number, number, number]) => Promise<Blob>; EditorFixture: Fixture };
      return scope.EditorFixture.renderPreview(
        await scope.makeSource(64, 64, [200, 120, 60]),
        { quarterTurns: 0, crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 }, filter: 'mono', adjustmentLayers: { autoValues: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, blackPoint: 0, saturation: 0, warmth: 0 }, autoStrength: 0, manual: { exposure: 0.5 } } },
        1440,
      );
    });
    // 기대값은 순수 함수로 구한다(미리보기는 손실 압축이라 허용 오차를 넓게 둔다).
    const expected = await page.evaluate(async () => {
      const scope = window as unknown as { makeSource: (w: number, h: number, s: [number, number, number]) => Promise<Blob>; EditorFixture: Fixture };
      const source = await scope.makeSource(64, 64, [200, 120, 60]);
      const e = { quarterTurns: 0, crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 }, filter: 'mono', adjustmentLayers: { autoValues: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, blackPoint: 0, saturation: 0, warmth: 0 }, autoStrength: 0, manual: { exposure: 0.5 } } } as const;
      return (await scope.EditorFixture.compareEdit(source, e as never)).maxDiff;
    });
    expect(expected).toBeLessThanOrEqual(TOLERANCE);
    const [r, g, b] = report.center;
    expect(Math.abs(r - g)).toBeLessThanOrEqual(4);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(4);
    expect(r).toBeGreaterThan(130);
  });

  test('TC-EDIT-033 TC-EDIT-034 자동 보정 분석기는 같은 영역에 computeAutoValues를 부른 값과 같다(돌린 사진의 일부 영역)', async ({ page }) => {
    const report = await page.evaluate(async () => {
      const scope = window as unknown as { makeSource: (w: number, h: number, s: null) => Promise<Blob>; EditorFixture: Fixture };
      return scope.EditorFixture.analyze(await scope.makeSource(200, 120, null), { quarterTurns: 1, crop: { centerX: 0.4, centerY: 0.5, width: 0.6, height: 0.8 } });
    });
    expect(report.actual).not.toBeNull();
    for (const [key, value] of Object.entries(report.expected)) expect(report.actual![key as keyof typeof report.expected], key).toBeCloseTo(value, 2);
  });
});

test.describe('편집기 화면 (Chromium 실제 디코드·미리보기·포인터)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      const scope = window as unknown as { makeSource: (w: number, h: number, s: null) => Promise<Blob>; EditorFixture: Fixture };
      const identity = { quarterTurns: 0, crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 }, filter: 'original', adjustmentLayers: { autoValues: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, blackPoint: 0, saturation: 0, warmth: 0 }, autoStrength: 0, manual: {} } } as const;
      scope.EditorFixture.mountEditor(await scope.makeSource(600, 400, null), identity as never);
    });
  });

  test('TC-EDIT-002 실제 미리보기가 그려지고 필터 썸네일 6장이 만들어진다', async ({ page }) => {
    const preview = page.getByTestId('photo-edit.preview-image');
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(600);
    await page.getByTestId('photo-edit.tab-filter').click();
    for (const filter of ['original', 'mono', 'warm', 'cool', 'vintage', 'vivid']) {
      const thumb = page.getByTestId(`photo-edit.filter-${filter}`).locator('img');
      await expect(thumb).toBeVisible();
      await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    }
  });

  test('TC-EDIT-018 손잡이를 끌면 실제 포인터 입력으로 프레임이 줄어든다', async ({ page }) => {
    const area = page.getByTestId('photo-edit.crop-area');
    await expect(area).toBeVisible();
    const handle = area.locator('[data-handle="bottom-right"]');
    const box = (await handle.boundingBox())!;
    const areaBox = (await area.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - areaBox.width / 2, y - areaBox.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(area).toHaveAttribute('data-width', '0.5000');
    await expect(area).toHaveAttribute('data-height', '0.5000');
    await expect(area).toHaveAttribute('data-center-x', '0.2500');
  });

  test('TC-EDIT-003 필터를 고르고 완료하면 편집값 하나가 전달된다', async ({ page }) => {
    await page.getByTestId('photo-edit.tab-filter').click();
    await page.getByTestId('photo-edit.filter-warm').click();
    await page.getByTestId('photo-edit.done-button').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __editorEvents: unknown[] }).__editorEvents.length)).toBe(1);
    const events = await page.evaluate(() => (window as unknown as { __editorEvents: { type: string; edit: PhotoEdit }[] }).__editorEvents);
    expect(events[0]!.type).toBe('confirm');
    expect(events[0]!.edit.filter).toBe('warm');
  });
});
