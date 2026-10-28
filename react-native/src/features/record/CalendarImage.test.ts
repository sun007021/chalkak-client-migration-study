import { fakePng } from './__testing__/FakeCalendarImage';
import { isPng, isValidRenderedImage } from './CalendarImage';

describe('PNG 검사', () => {
  it('시그니처와 크기를 본다', () => {
    expect(isPng(fakePng().bytes)).toBe(true);
    expect(isPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(false);
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isValidRenderedImage(fakePng())).toBe(true);
    expect(isValidRenderedImage({ ...fakePng(), height: 0 })).toBe(false);
  });
});
