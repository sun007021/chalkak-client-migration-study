import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { loadFixture } from '../core/http/__testing__/loadFixture';
import { FakeNotificationResponseSource } from '../core/push/__testing__/FakeNotificationResponseSource';
import { FakePushMessageSource } from '../core/push/__testing__/FakePushMessageSource';
import { FakePushNotificationPresenter } from '../core/push/__testing__/FakePushNotificationPresenter';
import { FakePushPermissionGateway } from '../core/push/__testing__/FakePushPermissionGateway';
import { FakePushPromptFlagStore } from '../core/push/__testing__/FakePushPromptFlagStore';
import { FakePushTokenProvider } from '../core/push/__testing__/FakePushTokenProvider';
import { FakePendingPushStore } from '../features/push/__testing__/FakePendingPushStore';
import { FakePushTapBlocker } from '../features/push/__testing__/FakePushTapBlocker';
import { AppContainer } from './AppContainer';

const settle = async () => {
  for (let i = 0; i < 80; i += 1) await Promise.resolve();
};

function create() {
  const net = createNetHarness();
  const permission = new FakePushPermissionGateway('undetermined');
  const tokens = new FakePushTokenProvider('fcm-1');
  const responses = new FakeNotificationResponseSource();
  const messages = new FakePushMessageSource();
  const presenter = new FakePushNotificationPresenter();
  const flags = new FakePushPromptFlagStore();
  const container = AppContainer.create(
    { apiBaseUrl: 'http://localhost:4010/api/v1/' },
    {
      clock: net.clock,
      sessionStore: net.sessionStore,
      events: net.events,
      api: net.api,
      pushPermission: permission,
      pushTokens: tokens,
      pushResponses: responses,
      pushMessages: messages,
      pushPresenter: presenter,
      pushPromptFlags: flags,
      pendingPushStore: new FakePendingPushStore(),
      pushTapBlocker: new FakePushTapBlocker(),
    },
  );
  return { net, container, permission, tokens, responses, messages, presenter, flags };
}

describe('AppContainer 푸시 조립', () => {
  it('주입한 포트로 푸시 런타임을 시작하고 stop하면 모든 구독을 해제한다', () => {
    const h = create();
    const stop = h.container.startPush();
    expect(h.tokens.listenerCount).toBe(1);
    expect(h.responses.listenerCount).toBe(1);
    expect(h.messages.listenerCount).toBe(1);
    stop();
    expect(h.tokens.listenerCount).toBe(0);
    expect(h.responses.listenerCount).toBe(0);
    expect(h.messages.listenerCount).toBe(0);
  });

  it('TC-PUSH-001 회원이 메인에 들어가면 권한을 한 번 요청한다', async () => {
    const h = create();
    h.container.startPush();
    h.container.bootViewModel.toMain('member');
    await settle();
    expect(h.permission.requestCalls).toBe(1);
  });

  it('TC-PUSH-032 로그아웃은 등록 중복 제거를 비우고 푸시 기기 해제 API를 부르지 않는다', async () => {
    const h = create();
    await h.net.signIn({
      accessToken: loadFixture<{ token: string }>('push/jwt__with-session-id').token,
    });
    h.net.transport.respond(async (request) => {
      if (request.method === 'PUT') return { status: 204, headers: {}, bodyText: '' };
      return { status: 204, headers: {}, bodyText: '' };
    });
    h.container.startPush();
    await h.container.authRepository.logout();
    expect(h.net.transport.requests.filter((r) => r.url.includes('push-devices'))).toEqual(
      h.net.transport.requests.filter((r) => r.method === 'PUT' && r.url.includes('push-devices')),
    );
    expect(h.net.transport.requests.some((r) => r.method === 'DELETE')).toBe(false);
  });
});
