import { bytesToBase64 } from '../../core/encoding/base64';
import { d } from '../../core/time/__testing__/helpers';
import { YearMonth } from '../../core/time/YearMonth';
import type { CalendarImageInput } from './CalendarImage';
import { FakeSleeper } from '../../core/http/__testing__/FakeSleeper';
import {
  CAPTURE_TIMEOUT_MS,
  readPngSize,
  ViewShotCalendarImageRenderer,
} from './ViewShotCalendarImageRenderer';

const input: CalendarImageInput = {
  month: YearMonth.of(2026, 10),
  photos: [],
  today: d('2026-10-27'),
};

/** 8바이트 시그니처 + IHDR 길이/타입 + 가로 720, 세로 960. */
const png = (width: number, height: number): Uint8Array => {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    ...u32(width),
    ...u32(height),
  ]);
};

describe('readPngSize', () => {
  it('IHDR의 가로·세로를 읽고 짧은 입력은 0이다', () => {
    expect(readPngSize(png(1080, 1500))).toEqual({ width: 1080, height: 1500 });
    expect(readPngSize(new Uint8Array([1, 2, 3]))).toEqual({ width: 0, height: 0 });
  });
});

describe('ViewShotCalendarImageRenderer', () => {
  it('호스트가 없으면 기다리지 않고 실패한다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    await expect(renderer.render(input)).rejects.toThrow('no calendar capture host');
  });

  it('호스트가 캡처 결과를 주면 바이트와 PNG 크기로 풀린다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    renderer.attachHost();
    const pending = renderer.render(input);
    await Promise.resolve();
    const request = renderer.getSnapshot().request;
    expect(request?.input).toBe(input);
    request?.succeed(bytesToBase64(png(720, 960)));
    const image = await pending;
    expect(image).toMatchObject({ width: 720, height: 960 });
    expect(image.bytes[1]).toBe(0x50);
    expect(renderer.getSnapshot().request).toBeNull();
  });

  it('요청은 한 번에 하나씩 순서대로 처리한다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    renderer.attachHost();
    const first = renderer.render(input);
    const second = renderer.render({ ...input, month: YearMonth.of(2026, 9) });
    await Promise.resolve();
    expect(renderer.getSnapshot().request?.input.month.toString()).toBe('2026-10');
    renderer.getSnapshot().request?.succeed(bytesToBase64(png(1, 1)));
    await first;
    await Promise.resolve();
    await Promise.resolve();
    expect(renderer.getSnapshot().request?.input.month.toString()).toBe('2026-09');
    renderer.getSnapshot().request?.fail(new Error('boom'));
    await expect(second).rejects.toThrow('boom');
  });

  it('진행 중 호스트가 사라지면 실패하고, 해제 함수를 여러 번 불러도 안전하다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    const detach = renderer.attachHost();
    const pending = renderer.render(input);
    await Promise.resolve();
    detach();
    detach();
    await expect(pending).rejects.toThrow('detached');
  });

  it('호스트가 응답하지 않으면 20초 뒤 실패하고 요청 칸을 비우며 다음 요청을 처리한다', async () => {
    const sleeper = new FakeSleeper(true);
    const renderer = new ViewShotCalendarImageRenderer(sleeper);
    renderer.attachHost();
    const first = renderer.render(input);
    await Promise.resolve();
    const stale = renderer.getSnapshot().request;
    expect(sleeper.calls).toEqual([CAPTURE_TIMEOUT_MS]);
    expect(CAPTURE_TIMEOUT_MS).toBe(20_000);
    sleeper.release();
    await expect(first).rejects.toThrow('timed out');
    expect(renderer.getSnapshot().request).toBeNull();

    const second = renderer.render({ ...input, month: YearMonth.of(2026, 9) });
    await Promise.resolve();
    await Promise.resolve();
    const current = renderer.getSnapshot().request;
    expect(current?.input.month.toString()).toBe('2026-09');
    // 시간 초과된 낡은 요청에 늦게 온 결과는 새 요청을 지우지 않는다.
    stale?.succeed(bytesToBase64(png(1, 1)));
    expect(renderer.getSnapshot().request).toBe(current);
    current?.succeed(bytesToBase64(png(2, 2)));
    await expect(second).resolves.toMatchObject({ width: 2, height: 2 });
  });
});
