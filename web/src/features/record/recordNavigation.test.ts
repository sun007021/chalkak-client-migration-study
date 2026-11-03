import { vi } from 'vitest';
import { AttachableRecordNavigator, RouterRecordNavigator, readRecordFeedEntry, recordDisplayPath, recordFeedLocationState } from './recordNavigation';
import type { RecordNavigator } from './recordNavigation';

const THUMB = 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222290/thumbnail.webp';
const POST = '22222222-2222-4222-8222-222222222290';

describe('기록 → 상세·전시 이동 계약 (REQ-REC-034, 035)', () => {
  it('TC-REC-034 전시 경로는 /display?date=…이고 정렬은 정하지 않는다', () => {
    expect(recordDisplayPath('2026-10-20')).toBe('/display?date=2026-10-20');
  });

  it('TC-REC-034 상세 state는 내 게시물 가정(assumeMine)과 썸네일 URL이다', () => {
    expect(recordFeedLocationState(THUMB)).toEqual({ assumeMine: true, thumbnailImageUrl: THUMB });
  });

  it('TC-REC-034 TC-FEED-004 readRecordFeedEntry는 assumeMine이 true인 state만 기록 진입으로 읽는다', () => {
    expect(readRecordFeedEntry(recordFeedLocationState(THUMB))).toEqual({ assumeMine: true, thumbnailImageUrl: THUMB });
    for (const state of [null, undefined, 'x', 3, {}, { assumeMine: false, thumbnailImageUrl: THUMB }, { assumeMine: 'true' }, { seed: {} }]) expect(readRecordFeedEntry(state), JSON.stringify(state)).toBeNull();
  });

  it('TC-REC-034 history.state는 사용자가 바꿀 수 있는 입력이다: 썸네일은 https만 받고 아니면 null(진입 자체는 유효)', () => {
    for (const bad of ['http://cdn.example.test/a.webp', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '', 42, undefined]) {
      expect(readRecordFeedEntry({ assumeMine: true, thumbnailImageUrl: bad }), String(bad)).toEqual({ assumeMine: true, thumbnailImageUrl: null });
    }
  });

  it('TC-REC-034 RouterRecordNavigator: 피드는 /feed/{postId}를 push(state 포함), 전시는 /display?date=를 push한다', () => {
    const navigate = vi.fn();
    const nav = new RouterRecordNavigator(navigate);
    nav.openFeed({ postId: POST, thumbnailImageUrl: THUMB });
    nav.openDisplay('2026-10-20');
    expect(navigate.mock.calls).toEqual([[`/feed/${POST}`, { state: { assumeMine: true, thumbnailImageUrl: THUMB } }], ['/display?date=2026-10-20']]);
  });

  it('TC-REC-034 AttachableRecordNavigator: 붙어 있는 동안만 전달하고, 떼면 버리며, 오래된 해제 함수는 새로 붙은 구현을 떼지 않는다', () => {
    const calls: string[] = [];
    const make = (name: string): RecordNavigator => ({
      openFeed: (target) => void calls.push(`${name}:feed:${target.postId}`),
      openDisplay: (date) => void calls.push(`${name}:display:${date}`),
    });
    const nav = new AttachableRecordNavigator();
    nav.openDisplay('2026-10-20'); // 붙기 전: 버린다
    const detachA = nav.attach(make('A'));
    nav.openFeed({ postId: POST, thumbnailImageUrl: THUMB });
    const detachB = nav.attach(make('B'));
    detachA(); // 이미 B로 바뀌었다: B를 떼지 않는다
    nav.openDisplay('2026-10-21');
    detachB();
    nav.openDisplay('2026-10-22');
    expect(calls).toEqual([`A:feed:${POST}`, 'B:display:2026-10-21']);
  });
});
