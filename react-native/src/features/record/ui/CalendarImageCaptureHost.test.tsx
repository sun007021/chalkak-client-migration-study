import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { captureRef } from 'react-native-view-shot';

import { bytesToBase64 } from '../../../core/encoding/base64';
import { d } from '../../../core/time/__testing__/helpers';
import { YearMonth } from '../../../core/time/YearMonth';
import type { CalendarImageInput } from '../CalendarImage';
import { fakePng } from '../__testing__/FakeCalendarImage';
import { ViewShotCalendarImageRenderer } from '../ViewShotCalendarImageRenderer';
import { CalendarImageCaptureHost } from './CalendarImageCaptureHost';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

/** 캡처용 뷰는 화면 밖·접근성 숨김이라 숨은 요소도 찾는다. */
const HIDDEN = { includeHiddenElements: true };
const layOut = () => fireEvent(screen.getByTestId('calendar-image.root', HIDDEN), 'layout');
const pngBase64 = bytesToBase64(fakePng().bytes);
const photo = (date: string) => ({
  postId: `p-${date}`,
  date: d(date),
  thumbnailUrl: `https://cdn.example.test/${date}.webp`,
  status: 'APPROVED' as const,
});
const input = (photos: CalendarImageInput['photos']): CalendarImageInput => ({
  month: YearMonth.of(2026, 10),
  photos,
  today: d('2026-10-27'),
});

beforeEach(() => {
  jest.mocked(captureRef).mockReset().mockResolvedValue(pngBase64);
});

describe('CalendarImageCaptureHost', () => {
  it('사진이 없으면 바로 PNG(base64)로 캡처해 렌더러 요청을 끝낸다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    await render(<CalendarImageCaptureHost renderer={renderer} />);
    let result!: Awaited<ReturnType<typeof renderer.render>>;
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = renderer.render(input([])).then((image) => (result = image));
    });
    // 레이아웃이 끝나기 전에는 캡처하지 않는다(빈 이미지 방지).
    expect(captureRef).not.toHaveBeenCalled();
    await layOut();
    await act(async () => {
      await pending;
    });
    expect(jest.mocked(captureRef).mock.calls[0][1]).toMatchObject({
      format: 'png',
      result: 'base64',
    });
    expect([...result.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(renderer.getSnapshot().request).toBeNull();
  });

  it('썸네일 로딩이 모두 끝난 뒤에 캡처한다(실패한 썸네일도 끝난 것으로 센다)', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    await render(<CalendarImageCaptureHost renderer={renderer} />);
    let done = false;
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = renderer.render(input([photo('2026-10-20'), photo('2026-10-27')])).then(() => {
        done = true;
      });
    });
    expect(captureRef).not.toHaveBeenCalled();
    await layOut();
    expect(captureRef).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('calendar-image.photo-2026-10-20', HIDDEN), 'load');
    await fireEvent(screen.getByTestId('calendar-image.photo-2026-10-27', HIDDEN), 'error');
    await act(async () => {
      await pending;
    });
    expect(captureRef).toHaveBeenCalledTimes(1);
    expect(done).toBe(true);
  });

  it('캡처가 실패하면 렌더러 요청이 실패한다', async () => {
    jest.mocked(captureRef).mockRejectedValue(new Error('capture failed'));
    const renderer = new ViewShotCalendarImageRenderer();
    await render(<CalendarImageCaptureHost renderer={renderer} />);
    let error: unknown;
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = renderer.render(input([])).catch((e: unknown) => (error = e));
    });
    await layOut();
    await act(async () => {
      await pending;
    });
    expect(error).toEqual(new Error('capture failed'));
  });

  it('언마운트하면 호스트가 해제돼 이후 요청은 바로 실패한다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    const view = await render(<CalendarImageCaptureHost renderer={renderer} />);
    await view.unmount();
    await expect(renderer.render(input([]))).rejects.toThrow('no calendar capture host');
  });

  it('썸네일이 제때 준비되지 않으면 사진이 빠진 PNG를 만들지 않고 실패한다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    await render(<CalendarImageCaptureHost renderer={renderer} imageWaitMs={30} />);
    let error: unknown;
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = renderer.render(input([photo('2026-10-20')])).catch((e: unknown) => (error = e));
    });
    await layOut();
    await act(async () => {
      await pending;
    });
    expect(error).toEqual(new Error('calendar view was not ready in time'));
    expect(captureRef).not.toHaveBeenCalled();
    expect(renderer.getSnapshot().request).toBeNull();
  });

  it('레이아웃이 끝나지 않아도 제한 시간 뒤에는 실패한다', async () => {
    const renderer = new ViewShotCalendarImageRenderer();
    await render(<CalendarImageCaptureHost renderer={renderer} imageWaitMs={30} />);
    let error: unknown;
    await act(async () => {
      await renderer.render(input([])).catch((e: unknown) => (error = e));
    });
    expect(error).toBeInstanceOf(Error);
    expect(captureRef).not.toHaveBeenCalled();
  });
});
