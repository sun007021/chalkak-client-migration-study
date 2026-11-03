import { vi } from 'vitest';
import { notificationDetailPath, ROUTES } from '../../app/paths';
import { readOpenAiReview } from '../aireview/aiEntry';
import { noti, SOURCE_POST } from '../../test/notificationHarness';
import { FakeNotificationNavigator } from '../../test/FakeNotificationNavigator';
import { AttachableNotificationNavigator, INBOX_BELOW_STATE, planBackToInbox, planInboxClose, RouterNotificationNavigator } from './notificationNavigation';

describe('경로 (notificationDetailPath)', () => {
  it('TC-NOTI-030 알림 상세 경로는 /notifications/{id}이고 라우트 패턴과 짝이다', () => {
    expect(notificationDetailPath(noti(5))).toBe(`/notifications/${noti(5)}`);
    expect(ROUTES.notificationDetail).toBe('/notifications/:notificationId');
    expect(notificationDetailPath('a/b?c')).toBe('/notifications/a%2Fb%3Fc');
  });
});

describe('RouterNotificationNavigator', () => {
  const setup = () => {
    const navigate = vi.fn();
    return { navigate, nav: new RouterNotificationNavigator(navigate) };
  };

  it('TC-NOTI-027 게시물 상세는 /feed/{postId}를 push하고 AI 시트 플래그가 없다', () => {
    const { navigate, nav } = setup();
    nav.openPost({ postId: SOURCE_POST, openAiReview: false });
    expect(navigate).toHaveBeenCalledTimes(1);
    const [to, options] = navigate.mock.calls[0] as [string, { state?: unknown; replace?: boolean } | undefined];
    expect(to).toBe(`/feed/${SOURCE_POST}`);
    expect(options?.replace).not.toBe(true);
    expect(readOpenAiReview(options?.state)).toBe(false);
  });

  it('TC-NOTI-028 AI 알림은 state { openAiReview: true }로 상세를 연다(홈 "자세히 보기"와 같은 계약)', () => {
    const { navigate, nav } = setup();
    nav.openPost({ postId: SOURCE_POST, openAiReview: true });
    const [to, options] = navigate.mock.calls[0] as [string, { state?: unknown }];
    expect(to).toBe(`/feed/${SOURCE_POST}`);
    expect(readOpenAiReview(options.state)).toBe(true);
  });

  it('TC-NOTI-030 알림 상세는 /notifications/{id}를 push하고 INBOX_BELOW_STATE를 넣는다', () => {
    const { navigate, nav } = setup();
    nav.openDetail(noti(5));
    expect(navigate).toHaveBeenCalledWith(`/notifications/${noti(5)}`, { state: INBOX_BELOW_STATE });
  });

  it('TC-NOTI-025 홈은 /home을 push한다', () => {
    const { navigate, nav } = setup();
    nav.openHome();
    const [to, options] = navigate.mock.calls[0] as [string, { replace?: boolean } | undefined];
    expect(to).toBe('/home');
    expect(options?.replace).not.toBe(true);
  });
});

describe('AttachableNotificationNavigator', () => {
  it('붙어 있는 동안만 전달하고 붙어 있지 않을 때의 요청은 버린다', () => {
    const attachable = new AttachableNotificationNavigator();
    const fake = new FakeNotificationNavigator();
    attachable.openHome(); // 붙기 전: 버림
    const detach = attachable.attach(fake);
    attachable.openPost({ postId: SOURCE_POST, openAiReview: true });
    attachable.openDetail(noti(2));
    attachable.openHome();
    detach();
    attachable.openHome(); // 뗀 뒤: 버림
    expect(fake.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: true }, { type: 'detail', notificationId: noti(2) }, { type: 'home' }]);
  });

  it('그 사이 다른 구현이 붙었으면 이전 해제 함수는 새 구현을 떼지 않는다', () => {
    const attachable = new AttachableNotificationNavigator();
    const first = new FakeNotificationNavigator();
    const second = new FakeNotificationNavigator();
    const detachFirst = attachable.attach(first);
    attachable.attach(second);
    detachFirst();
    attachable.openHome();
    expect(first.calls).toHaveLength(0);
    expect(second.calls).toEqual([{ type: 'home' }]);
  });
});

describe('planBackToInbox (REQ-NOTI-026 알림함으로)', () => {
  it('TC-NOTI-042 알림함을 거쳐 push한 상세(key가 default가 아니고 inboxBelow)는 뒤로(상세만 닫는다)', () => {
    expect(planBackToInbox({ key: 'abc123', state: INBOX_BELOW_STATE })).toEqual({ kind: 'back' });
  });

  it.each([
    ['새로고침·딥링크로 첫 항목(key=default)', { key: 'default', state: INBOX_BELOW_STATE }],
    ['state 없음', { key: 'abc123', state: null }],
    ['위조된 state', { key: 'abc123', state: { inboxBelow: 'yes' } }],
    ['다른 state', { key: 'abc123', state: { settingsBelow: true } }],
  ])('TC-NOTI-042 %s: 알림함으로 replace한다', (_name, location) => {
    expect(planBackToInbox(location)).toEqual({ kind: 'replace', to: '/notifications' });
  });
});

describe('planInboxClose (알림함 뒤로)', () => {
  it('TC-NAV-030 앱 안에서 push한 알림함은 뒤로, 첫 항목이면 홈으로 replace한다', () => {
    expect(planInboxClose({ key: 'abc123' })).toEqual({ kind: 'back' });
    expect(planInboxClose({ key: 'default' })).toEqual({ kind: 'replace', to: '/home' });
  });
});
