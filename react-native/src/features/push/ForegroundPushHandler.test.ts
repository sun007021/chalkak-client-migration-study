import { FakePushMessageSource } from '../../core/push/__testing__/FakePushMessageSource';
import { FakePushNotificationPresenter } from '../../core/push/__testing__/FakePushNotificationPresenter';
import { FakePushPermissionGateway } from '../../core/push/__testing__/FakePushPermissionGateway';
import { loadFixture } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import { FakeHomeNotificationTarget } from '../notification/__testing__/createNotificationHarness';
import type { PushMessage } from '../../core/push/PushMessageSource';
import type { PushPermissionStatus } from '../../core/push/PushPermissionGateway';
import { ForegroundPushHandler } from './ForegroundPushHandler';

type PushFixture = { data: Record<string, unknown>; notification: { title: string; body: string } };
const message = (name: string, over: Partial<PushMessage> = {}): PushMessage => {
  const f = loadFixture<PushFixture>(`push/${name}`);
  return { data: f.data, title: f.notification.title, body: f.notification.body, ...over };
};
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function setup(permission: PushPermissionStatus = 'granted') {
  const messages = new FakePushMessageSource();
  const presenter = new FakePushNotificationPresenter();
  const home = new FakeHomeNotificationTarget();
  const handler = new ForegroundPushHandler({
    messages,
    permission: new FakePushPermissionGateway(permission),
    presenter,
    home: () => home,
  });
  const stop = handler.start();
  return { messages, presenter, home, stop };
}

describe('ForegroundPushHandler', () => {
  it('TC-PUSH-068 권한이 허용이면 서버가 준 제목·본문으로 알림을 표시한다', async () => {
    const h = setup('granted');
    h.messages.receive(message('payload__post-approved'));
    await settle();
    expect(h.presenter.shown).toEqual([
      { title: '사진이 승인되었어요', body: '오늘의 사진이 전시에 올라갔어요.' },
    ]);
  });

  it('TC-PUSH-068 본문이 비면 push.default.body를 쓴다', async () => {
    const h = setup('granted');
    h.messages.receive(message('payload__post-approved', { body: '' }));
    h.messages.receive(message('payload__post-approved', { body: null }));
    await settle();
    expect(h.presenter.shown.map((s) => s.body)).toEqual([
      t('push.default.body'),
      t('push.default.body'),
    ]);
  });

  it.each(['denied', 'undetermined'] as const)(
    'TC-PUSH-068 권한이 %s면 아무것도 표시하지 않는다',
    async (status) => {
      const h = setup(status);
      h.messages.receive(message('payload__post-approved'));
      await settle();
      expect(h.presenter.shown).toEqual([]);
    },
  );

  it('TC-PUSH-071 REQ-PUSH-020 푸시를 받으면 권한과 상관없이 미읽음을 다시 조회한다', async () => {
    const h = setup('denied');
    h.messages.receive(message('payload__post-approved'));
    await settle();
    expect(h.home.unreadRefreshes).toBe(1);
  });

  it('TC-PUSH-073 설정으로 거르지 않고 type과 상관없이 표시한다(AI 리뷰도 생략하지 않는다: 확인 필요 2번)', async () => {
    const h = setup('granted');
    h.messages.receive(message('payload__ai-review-completed'));
    h.messages.receive(message('payload__topic'));
    await settle();
    expect(h.presenter.shown).toHaveLength(2);
  });

  it('stop 뒤에는 구독이 없다', async () => {
    const h = setup();
    h.stop();
    expect(h.messages.listenerCount).toBe(0);
  });
});
