import { d } from '../core/time/__testing__/helpers';
import { NavigationRecordNavigator } from './NavigationRecordNavigator';
import { TabReturnHint } from './TabReturnHint';

describe('NavigationRecordNavigator → 상세·전시 계약', () => {
  it('TC-REC-034 상세는 내 게시물(entry=mine)로 썸네일과 함께 연다', () => {
    const navigate = jest.fn();
    const navigator = new NavigationRecordNavigator({ isReady: () => true, navigate } as never);
    navigator.openPostDetail({ postId: 'p1', thumbnailUrl: 'https://cdn.example.test/t.webp' });
    expect(navigate).toHaveBeenCalledWith('PostDetail', {
      postId: 'p1',
      entry: 'mine',
      thumbnailUrl: 'https://cdn.example.test/t.webp',
    });
  });

  it('TC-REC-034 전시는 전시 탭을 그 주제 날짜로 연다', () => {
    const navigate = jest.fn();
    const navigator = new NavigationRecordNavigator({ isReady: () => true, navigate } as never);
    navigator.openDisplay(d('2026-10-31'));
    expect(navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Display',
      params: { date: '2026-10-31' },
    });
  });

  it('내비게이션이 준비되지 않았으면 이동 요청을 버린다', () => {
    const navigate = jest.fn();
    const navigator = new NavigationRecordNavigator({ isReady: () => false, navigate } as never);
    navigator.openPostDetail({ postId: 'p1', thumbnailUrl: 'x' });
    navigator.openDisplay(d('2026-10-31'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('REQ-NAV-030 전시를 열 때만 "뒤로 가면 기록" 힌트를 남기고, 상세와 준비 전에는 남기지 않는다', () => {
    const hint = new TabReturnHint();
    const ready = new NavigationRecordNavigator(
      { isReady: () => true, navigate: jest.fn() } as never,
      hint,
    );
    ready.openPostDetail({ postId: 'p1', thumbnailUrl: 'x' });
    expect(hint.get()).toBeNull();
    ready.openDisplay(d('2026-10-31'));
    expect(hint.get()).toBe('Record');

    const notReady = new TabReturnHint();
    new NavigationRecordNavigator(
      { isReady: () => false, navigate: jest.fn() } as never,
      notReady,
    ).openDisplay(d('2026-10-31'));
    expect(notReady.get()).toBeNull();
  });
});
