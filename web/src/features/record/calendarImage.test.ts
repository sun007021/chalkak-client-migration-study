import { pngBytesOf, pngOf } from '../../test/pngBytes';
import { OCT_20, OCT_27, OCT_31 } from '../../test/recordRoutes';
import { loadFixture } from '../../test/fixtures';
import { buildCalendarImageModel, readPngSize } from './calendarImage';
import type { CalendarPost } from './recordModels';

const octPosts = (loadFixture('record/posts-calendar__2026-10.json').json as { posts: CalendarPost[] }).posts;

describe('buildCalendarImageModel (REQ-REC-037, 카탈로그 쟁점 4)', () => {
  it('TC-REC-038 연월 제목·요일 머리글·격자 칸(앞뒤 빈 칸 포함 7의 배수)을 만든다', () => {
    const model = buildCalendarImageModel({ year: 2026, month: 10 }, octPosts);
    expect(model).toMatchObject({ year: 2026, month: 10, title: '2026년 10월', weekdays: ['일', '월', '화', '수', '목', '금', '토'] });
    expect(model.cells).toHaveLength(35);
    expect(model.cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(model.cells[4]).toMatchObject({ day: 1, date: '2026-10-01' });
    expect(model.cells.filter((c) => c !== null)).toHaveLength(31);
    expect(model.cells.at(-1)).toMatchObject({ day: 31, date: '2026-10-31' }); // 10/31은 토요일이라 뒤 칸이 비지 않는다
  });

  it('TC-REC-038 사진이 있는 날에만 썸네일 URL이 있고 PENDING 여부를 알린다', () => {
    const model = buildCalendarImageModel({ year: 2026, month: 10 }, octPosts);
    const cell = (day: number) => model.cells.find((c) => c?.day === day)!;
    expect(cell(20)).toMatchObject({ thumbnailUrl: `https://cdn.example.test/posts/${OCT_20}/thumbnail.webp`, pending: false });
    expect(cell(27)).toMatchObject({ thumbnailUrl: `https://cdn.example.test/posts/${OCT_27}/thumbnail.webp`, pending: true });
    expect(cell(31)).toMatchObject({ thumbnailUrl: `https://cdn.example.test/posts/${OCT_31}/thumbnail.webp`, pending: false });
    expect(cell(1)).toMatchObject({ thumbnailUrl: null, pending: false });
  });

  it('TC-REC-038 사진이 하나도 없는 달도 모델을 만든다(썸네일은 모두 null)', () => {
    const model = buildCalendarImageModel({ year: 2026, month: 11 }, []);
    expect(model.title).toBe('2026년 11월');
    expect(model.cells).toHaveLength(35);
    expect(model.cells.every((c) => c === null || c.thumbnailUrl === null)).toBe(true);
  });

  it('TC-REC-010 6행이 필요한 달은 42칸이다(2027-01)', () => {
    expect(buildCalendarImageModel({ year: 2027, month: 1 }, []).cells).toHaveLength(42);
  });
});

describe('readPngSize (TC-REC-038 PNG 형식 검증)', () => {
  it('시그니처가 PNG이면 IHDR의 가로세로를 읽는다', async () => {
    expect(await readPngSize(pngOf(1080, 1350))).toEqual({ width: 1080, height: 1350 });
    expect(await readPngSize(new Blob([pngBytesOf(1, 1)]))).toEqual({ width: 1, height: 1 });
  });

  it('PNG가 아니거나(JPEG 시그니처, 일반 텍스트) 잘렸으면 null이다', async () => {
    expect(await readPngSize(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])]))).toBeNull();
    expect(await readPngSize(new Blob(['not a png at all, just text bytes here...']))).toBeNull();
    expect(await readPngSize(new Blob([pngBytesOf(10, 10).slice(0, 12)]))).toBeNull();
    expect(await readPngSize(new Blob([]))).toBeNull();
  });

  it('가로세로가 0인 PNG는 0 그대로 돌려준다(거절 판단은 호출자)', async () => {
    expect(await readPngSize(pngOf(0, 0))).toEqual({ width: 0, height: 0 });
  });
});
