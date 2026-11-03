import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PostSpec } from './fixtures/calendarEntry';

/**
 * 실제 Chromium canvas로 기록 탭의 달력 이미지(CanvasCalendarImageExporter)를 그려 PNG 형식·크기·내용을 확인하고,
 * 실제 `<a download>`(AnchorFileDownloader)가 파일 이름대로 내려받게 하는지 확인한다(jsdom에는 canvas도 다운로드도 없다).
 * 대상: TC-REC-038(이미지 저장 실제 렌더), TC-REC-039(썸네일 로드 실패 시 날짜만 그리기), TC-REC-040(다운로드 파일 이름).
 * 테스트 전용 진입점(e2e/fixtures/calendarEntry.ts)을 vite로 따로 묶어 페이지에 주입하므로 앱 번들(dist)에는 테스트 코드가 들어가지 않는다.
 */
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
      lib: { entry: fileURLToPath(new URL('./fixtures/calendarEntry.ts', import.meta.url)), formats: ['es'], fileName: 'calendar-fixture' },
      rolldownOptions: { output: { codeSplitting: false } },
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  })) as Rollup.RolldownOutput | Rollup.RolldownOutput[];
  const first = (Array.isArray(output) ? output[0]! : output).output.find((chunk) => chunk.type === 'chunk');
  if (!first || first.type !== 'chunk') throw new Error('calendar fixture bundle was not produced');
  bundle = first.code;
});

type Fixture = typeof import('./fixtures/calendarEntry');

async function open(page: Page): Promise<void> {
  await page.route('**/__calendar-fixture.js', (route) => route.fulfill({ contentType: 'text/javascript', body: bundle }));
  await page.goto('/');
  await page.evaluate(async () => {
    (window as unknown as Record<string, unknown>)['CalendarFixture'] = await import('/__calendar-fixture.js' as string);
  });
}

/** 2026-10: 1일이 목요일이라 앞 빈 칸이 4개, 5주(35칸)다. */
const OCT = { year: 2026, month: 10 };
const RED: [number, number, number] = [220, 30, 30];
const BLUE: [number, number, number] = [30, 60, 220];
const specs: PostSpec[] = [
  { topicDate: '2026-10-20', status: 'APPROVED', thumbnail: RED },
  { topicDate: '2026-10-27', status: 'PENDING', thumbnail: BLUE },
  { topicDate: '2026-10-31', status: 'APPROVED', thumbnail: 'broken' },
];

// 이미지 배치(CanvasCalendarImageExporter): 너비 1080, 바깥 여백 50, 제목 120, 요일 56, 칸 140, 5주.
const WIDTH = 1080;
const HEIGHT = 50 + 120 + 56 + 5 * 140 + 50;
const GRID_TOP = 50 + 120 + 56;
/** 날짜 칸(index = 앞 빈 칸 4 + 일 - 1)의 가운데 좌표. */
const centerOf = (day: number): [number, number] => {
  const index = 4 + day - 1;
  return [50 + (index % 7) * 140 + 70, GRID_TOP + Math.floor(index / 7) * 140 + 70];
};

const near = (actual: number[], expected: number[], tolerance = 3): boolean => expected.every((value, index) => Math.abs(actual[index]! - value) <= tolerance);

async function render(page: Page, points: [number, number][]) {
  return page.evaluate(
    async ([ym, posts, pts]) => {
      const scope = window as unknown as { CalendarFixture: Fixture };
      return scope.CalendarFixture.renderCalendar(ym as typeof OCT, posts as PostSpec[], pts as [number, number][]);
    },
    [OCT, specs, points] as const,
  );
}

test.describe('달력 이미지 렌더 (Chromium 실제 canvas)', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('TC-REC-038 image/png이고 시그니처·가로세로가 맞으며 디코드 크기와 같다', async ({ page }) => {
    const report = await render(page, []);
    expect(report.type).toBe('image/png');
    expect(report.signature).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(report.size).toEqual({ width: WIDTH, height: HEIGHT });
    expect(report.decoded).toEqual({ width: WIDTH, height: HEIGHT });
  });

  test('TC-REC-038 사진이 있는 날은 썸네일, PENDING은 흐리게, 사진 없는 날은 빈 칸 색으로 그린다', async ({ page }) => {
    const points: [number, number][] = [centerOf(20), centerOf(27), centerOf(21), [20, 20]];
    const { pixels } = await render(page, points);
    expect(near(pixels[0]!, [220, 30, 30, 255])).toBe(true); // 10/20 APPROVED: 썸네일 색 그대로
    expect(pixels[1]![2]).toBeGreaterThan(220); // 10/27 PENDING(파랑 + 흰 덮개): 파랑 채널이 남고
    expect(pixels[1]![0]).toBeGreaterThan(120); // 빨강·초록 채널은 흰색 쪽으로 밝아진다
    expect(near(pixels[2]!, [242, 242, 242, 255])).toBe(true); // 10/21 사진 없음: 빈 칸
    expect(near(pixels[3]!, [255, 255, 255, 255])).toBe(true); // 이미지 바깥 여백
  });

  test('TC-REC-039 썸네일을 읽지 못한 칸은 날짜만 그리고 그리기 전체는 실패하지 않는다', async ({ page }) => {
    const { size, pixels } = await render(page, [centerOf(31)]);
    expect(size).toEqual({ width: WIDTH, height: HEIGHT });
    expect(near(pixels[0]!, [242, 242, 242, 255])).toBe(true); // 10/31: 사진 대신 빈 칸 색
  });

  test('TC-REC-010 6주가 필요한 달(2027-01)은 한 행만큼 더 높다', async ({ page }) => {
    const report = await page.evaluate(async () => {
      const scope = window as unknown as { CalendarFixture: Fixture };
      return scope.CalendarFixture.renderCalendar({ year: 2027, month: 1 }, [], []);
    });
    expect(report.size).toEqual({ width: WIDTH, height: HEIGHT + 140 });
  });
});

test.describe('파일 다운로드 (`<a download>`)', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('TC-REC-038 TC-REC-040 chalkak-calendar-2026-10.png 이름으로 PNG 파일이 내려받아진다', async ({ page }) => {
    const downloading = page.waitForEvent('download');
    await page.evaluate(
      async ([ym, posts]) => {
        const scope = window as unknown as { CalendarFixture: Fixture };
        await scope.CalendarFixture.downloadCalendar(ym as typeof OCT, posts as PostSpec[], 'chalkak-calendar-2026-10.png');
      },
      [OCT, specs] as const,
    );
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('chalkak-calendar-2026-10.png');
    const path = await download.path();
    const bytes = await readFile(path);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(WIDTH);
    expect(bytes.readUInt32BE(20)).toBe(HEIGHT);
    // 임시 앵커는 DOM에 남지 않는다.
    expect(await page.locator('a[download]').count()).toBe(0);
  });
});
