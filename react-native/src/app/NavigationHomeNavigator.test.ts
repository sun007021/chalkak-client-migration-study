import { KstDate } from '../core/time/KstDate';
import { NavigationHomeNavigator } from './NavigationHomeNavigator';

function setup(ready = true) {
  const navigate = jest.fn();
  const navigator = new NavigationHomeNavigator({ isReady: () => ready, navigate } as never);
  return { navigator, navigate };
}

describe('NavigationHomeNavigator', () => {
  it('각 목적지로 이동한다', () => {
    const { navigator, navigate } = setup();
    navigator.openUploadGate();
    navigator.openNotifications();
    navigator.openPostDetail({ postId: 'p1', seed: null });
    navigator.openBanner({ id: 'b1', webViewUrl: 'https://web.example.test/1' });
    expect(navigate.mock.calls).toEqual([
      ['Upload'],
      ['Notifications'],
      ['PostDetail', { postId: 'p1' }],
      ['IssueWeb', { url: 'https://web.example.test/1' }],
    ]);
  });

  it('전시는 날짜와 인기순으로, 기록은 선택 날짜(없으면 null)로 탭을 연다', () => {
    const { navigator, navigate } = setup();
    navigator.openDisplayPopular(KstDate.of(2026, 10, 26));
    navigator.openRecord(KstDate.of(2026, 10, 27));
    navigator.openRecord(null);
    expect(navigate.mock.calls).toEqual([
      ['Tabs', { screen: 'Display', params: { date: '2026-10-26', sort: 'popular' } }],
      ['Tabs', { screen: 'Record', params: { selectedDate: '2026-10-27' } }],
      ['Tabs', { screen: 'Record', params: { selectedDate: null } }],
    ]);
  });

  it('내비게이션이 준비되기 전의 요청은 버린다', () => {
    const { navigator, navigate } = setup(false);
    navigator.openNotifications();
    expect(navigate).not.toHaveBeenCalled();
  });
});
