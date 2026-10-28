import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import {
  createNotificationHarness,
  deferredRoute,
  flush,
  nid,
  readKey,
  MY_POST_ID,
  type NotificationHarness,
} from './__testing__/createNotificationHarness';
import type { NotificationTapInput } from './NotificationTapPlan';

const ID = nid('01');
const approved: NotificationTapInput = {
  type: 'POST_APPROVED',
  notificationId: ID,
  sourceType: 'POST',
  sourceId: MY_POST_ID,
};
const READ_OK = 'notification/notification-read__no-content';
const reads = (h: NotificationHarness) => h.router.calls(readKey(ID));

async function setup(read: Parameters<typeof createNotificationHarness>[0] = {}) {
  return createNotificationHarness({ routes: { [readKey(ID)]: READ_OK }, ...read });
}

describe('NotificationTapProcessor 읽음 처리와 이동', () => {
  it('TC-NOTI-027 TC-PUSH-053 읽음 204 뒤 게시물 상세(내 게시물)로 이동하고 read 이벤트와 미읽음 재조회가 나간다', async () => {
    const h = await setup();
    const seen: string[] = [];
    h.events.subscribe((e) =>
      seen.push(`${e.type}:${'notificationId' in e ? e.notificationId : ''}`),
    );
    await expect(h.processor.process(approved, 'inbox')).resolves.toBe('navigated');
    expect(reads(h)).toHaveLength(1);
    expect(h.navigator.calls).toEqual([
      { type: 'post-detail', postId: MY_POST_ID, openAiSheet: false },
    ]);
    expect(seen).toEqual([`read:${ID}`]);
    expect(h.home.unreadRefreshes).toBe(1);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-NOTI-028 AI 알림은 읽음 뒤 게시물 상세 + AI 시트 자동 열기', async () => {
    const h = await setup();
    await h.processor.process({ ...approved, type: 'AI_REVIEW_FAILED' }, 'push');
    expect(h.navigator.calls).toEqual([
      { type: 'post-detail', postId: MY_POST_ID, openAiSheet: true },
    ]);
  });

  it('TC-NOTI-030 TC-NOTI-031 NOTICE·POST_REJECTED는 읽음 뒤 notificationId로 알림 상세', async () => {
    const h = await setup();
    await h.processor.process({ ...approved, type: 'NOTICE', sourceType: 'NOTICE' }, 'inbox');
    await h.processor.process({ ...approved, type: 'POST_REJECTED' }, 'inbox');
    expect(h.navigator.calls).toEqual([
      { type: 'notification-detail', notificationId: ID },
      { type: 'notification-detail', notificationId: ID },
    ]);
  });

  it('TC-NOTI-025 TC-PUSH-038 인박스의 TOPIC·REMINDER 행은 읽음 요청 없이 홈으로만 가고 홈 새로고침은 하지 않는다', async () => {
    const h = await setup();
    const topic = { type: 'TOPIC', notificationId: nid('31'), sourceType: 'TOPIC', sourceId: null };
    await h.processor.process(topic, 'inbox');
    await h.processor.process({ ...topic, type: 'REMINDER' }, 'inbox');
    expect(h.transport.requests).toHaveLength(0);
    expect(h.navigator.calls).toEqual([{ type: 'home' }, { type: 'home' }]);
    expect(h.home.pushOpened).toBe(0);
  });

  it('TC-PUSH-037 푸시 TOPIC은 홈으로 이동하고 onHomePushOpened로 맨 위 스크롤 + 새로고침, REMINDER는 이동만', async () => {
    const h = await setup();
    await h.processor.process(
      { type: 'TOPIC', notificationId: null, sourceType: 'TOPIC', sourceId: null },
      'push',
    );
    expect(h.navigator.calls).toEqual([{ type: 'home' }]);
    expect(h.home.pushOpened).toBe(1);
    await h.processor.process(
      { type: 'REMINDER', notificationId: null, sourceType: null, sourceId: null },
      'push',
    );
    expect(h.home.pushOpened).toBe(1);
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-NOTI-024 TC-NOTI-026 invalid 행은 인박스에서 이동도 읽음 요청도 하지 않는다', async () => {
    const h = await setup();
    await expect(
      h.processor.process({ ...approved, sourceType: null, sourceId: null }, 'inbox'),
    ).resolves.toBe('ignored');
    expect(h.transport.requests).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-PUSH-044 TC-PUSH-045 invalid 푸시는 읽음 요청 없이 알림함으로 간다', async () => {
    const h = await setup();
    await expect(h.processor.process({ ...approved, type: 'FUTURE_TYPE' }, 'push')).resolves.toBe(
      'inbox',
    );
    await h.processor.process({ ...approved, type: null }, 'push');
    expect(h.transport.requests).toHaveLength(0);
    expect(h.navigator.calls).toEqual([{ type: 'inbox' }, { type: 'inbox' }]);
  });

  it('TC-PUSH-048 읽음 경로에는 소문자 정규형 UUID를 쓴다', async () => {
    const h = await setup();
    await h.processor.process({ ...approved, notificationId: ID.toUpperCase() }, 'push');
    expect(reads(h)).toHaveLength(1);
  });

  it('TC-PUSH-052 같은 이벤트의 탭이 두 번이면 각각 처리한다(eventId로 중복 제거 안 함)', async () => {
    const h = await setup();
    await h.processor.process(approved, 'push');
    await h.processor.process(approved, 'push');
    expect(reads(h)).toHaveLength(2);
    expect(h.navigator.calls).toHaveLength(2);
  });
});

describe('NotificationTapProcessor 읽음 실패 처리', () => {
  it('TC-NOTI-032 TC-PUSH-054 네트워크 실패는 토스트 후 그래도 이동하고 read 이벤트는 없다', async () => {
    const h = await setup();
    h.router.set(readKey(ID), networkFailure());
    const seen: string[] = [];
    h.events.subscribe((e) => seen.push(e.type));
    await expect(h.processor.process(approved, 'inbox')).resolves.toBe('navigated');
    expect(h.toast.messages).toEqual([t('noti.read.error.network')]);
    expect(h.navigator.calls).toHaveLength(1);
    expect(seen).toEqual([]);
  });

  it('TC-NOTI-033 TC-PUSH-055 404는 noti.gone 토스트, 이동 없음, gone 이벤트와 미읽음 재조회', async () => {
    const h = await setup({
      routes: { [readKey(ID)]: 'notification/notification-read__not-found' },
    });
    const seen: string[] = [];
    h.events.subscribe((e) => seen.push(e.type));
    await expect(h.processor.process(approved, 'push')).resolves.toBe('rejected');
    expect(h.toast.messages).toEqual([t('noti.gone')]);
    expect(h.navigator.calls).toEqual([]);
    expect(seen).toEqual(['gone']);
    expect(h.home.unreadRefreshes).toBe(1);
  });

  it('TC-NOTI-034 TC-PUSH-056 500은 404와 같게 처리한다', async () => {
    const h = await setup({
      routes: { [readKey(ID)]: 'notification/notification-read__internal-error' },
    });
    await expect(h.processor.process(approved, 'inbox')).resolves.toBe('rejected');
    expect(h.toast.messages).toEqual([t('noti.gone')]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-NOTI-035 TC-PUSH-057 401 UNAUTHORIZED는 refresh 후 1회 재전송해 성공하면 이동한다', async () => {
    const h = await setup({
      routes: {
        [readKey(ID)]: ['notification/notification-read__unauthorized', READ_OK],
      },
    });
    await expect(h.processor.process(approved, 'push')).resolves.toBe('navigated');
    expect(reads(h)).toHaveLength(2);
    expect(h.router.calls('POST /auth/refresh')).toHaveLength(1);
  });

  it('TC-NOTI-035 TC-PUSH-057 REAUTH면 이동하지 않고 로그인 흐름에 맡기며 토스트도 없다', async () => {
    const h = await setup({
      routes: {
        [readKey(ID)]: 'notification/notification-read__unauthorized',
        'POST /auth/refresh': fixtureResponse('auth/refresh__reauthentication-required'),
      },
    });
    await expect(h.processor.process(approved, 'push')).resolves.toBe('auth');
    expect(h.navigator.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
    expect(h.emitted).toEqual([{ type: 'session-expired' }]);
  });

  it('TC-NOTI-039 신호가 abort되면 응답이 와도 이동하지 않고 오류도 없다', async () => {
    const gate = deferredRoute(READ_OK);
    const h = await setup({ routes: { [readKey(ID)]: gate.value } });
    const controller = new AbortController();
    const run = h.processor.process(approved, 'inbox', controller.signal);
    await flush();
    controller.abort();
    gate.release();
    await expect(run).resolves.toBe('ignored');
    expect(h.navigator.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-NOTI-040 읽음 요청 중 로그아웃·계정 전환(세션 generation 변화)이면 이동도 이벤트도 없다', async () => {
    const gate = deferredRoute(READ_OK);
    const h = await setup({ routes: { [readKey(ID)]: gate.value } });
    const seen: string[] = [];
    h.events.subscribe((e) => seen.push(e.type));
    const run = h.processor.process(approved, 'inbox');
    await flush();
    await h.sessionStore.clear();
    gate.release();
    await expect(run).resolves.toBe('ignored');
    expect(h.navigator.calls).toEqual([]);
    expect(seen).toEqual([]);
    expect(h.toast.messages).toEqual([]);
  });
});
