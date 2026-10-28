import { StackActions } from '@react-navigation/native';

import { NavigationNotificationNavigator } from './NavigationNotificationNavigator';

const POST = '22222222-2222-4222-8222-222222222201';

function setup(
  options: { ready?: boolean; route?: { name: string; params?: object } | null } = {},
) {
  const navigate = jest.fn();
  const dispatch = jest.fn();
  const navigator = new NavigationNotificationNavigator({
    isReady: () => options.ready ?? true,
    navigate,
    dispatch,
    getCurrentRoute: () => options.route ?? { name: 'Tabs' },
  } as never);
  return { navigator, navigate, dispatch };
}

describe('NavigationNotificationNavigator', () => {
  it('TC-PUSH-022 TC-PUSH-065 홈은 탭 루트 Home으로 이동한다(이미 홈이면 쌓이지 않는다)', () => {
    const { navigator, navigate } = setup();
    navigator.openHome();
    expect(navigate).toHaveBeenCalledWith('Tabs', { screen: 'Home' });
  });

  it('TC-PUSH-039 게시물 상세는 postId와 entry=mine(내 게시물)로 연다', () => {
    const { navigator, navigate } = setup();
    navigator.openPostDetail({ postId: POST, openAiSheet: false });
    expect(navigate).toHaveBeenCalledWith('PostDetail', { postId: POST, entry: 'mine' });
  });

  it('TC-PUSH-040 AI 리뷰는 openAiSheet 파라미터를 함께 싣는다', () => {
    const { navigator, navigate } = setup();
    navigator.openPostDetail({ postId: POST, openAiSheet: true });
    expect(navigate).toHaveBeenCalledWith('PostDetail', {
      postId: POST,
      entry: 'mine',
      openAiSheet: true,
    });
  });

  it('TC-PUSH-064 같은 게시물 상세가 이미 열려 있으면 새로 쌓지 않고 교체한다', () => {
    const { navigator, navigate, dispatch } = setup({
      route: { name: 'PostDetail', params: { postId: POST } },
    });
    navigator.openPostDetail({ postId: POST, openAiSheet: true });
    expect(navigate).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      StackActions.replace('PostDetail', { postId: POST, entry: 'mine', openAiSheet: true }),
    );
  });

  it('TC-PUSH-041 알림 상세는 notificationId로 연다', () => {
    const { navigator, navigate } = setup();
    navigator.openNotificationDetail('33333333-3333-4333-8333-333333333302');
    expect(navigate).toHaveBeenCalledWith('NotificationDetail', {
      notificationId: '33333333-3333-4333-8333-333333333302',
    });
  });

  it('REQ-NOTI-026 알림함 열기는 Notifications로 navigate한다(이미 아래에 있으면 상세만 닫힌다)', () => {
    const { navigator, navigate } = setup();
    navigator.openInbox();
    expect(navigate).toHaveBeenCalledWith('Notifications');
  });

  it('내비게이션이 준비되기 전의 요청은 버린다', () => {
    const { navigator, navigate, dispatch } = setup({ ready: false });
    navigator.openHome();
    navigator.openInbox();
    navigator.openPostDetail({ postId: POST, openAiSheet: false });
    expect(navigate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
