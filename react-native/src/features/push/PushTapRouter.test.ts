import { loadFixture } from '../../core/http/__testing__/loadFixture';
import { FakeNotificationResponseSource } from '../../core/push/__testing__/FakeNotificationResponseSource';
import type { PushData } from '../../core/push/NotificationResponseSource';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { createBootHarness } from '../boot/__testing__/createBootHarness';
import { FakePendingPushStore } from './__testing__/FakePendingPushStore';
import { FakePushTapBlocker } from './__testing__/FakePushTapBlocker';
import { PushTapRouter } from './PushTapRouter';

const data = (name: string): PushData => loadFixture<{ data: PushData }>(`push/${name}`).data;
const APPROVED = data('payload__post-approved');
const TOPIC = data('payload__topic');
const settle = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

type Options = { initial?: PushData | null; signedIn?: boolean; pending?: PushData | null };

async function setup(options: Options = {}) {
  const boot = createBootHarness();
  const net = createNetHarness();
  if (options.signedIn !== false) await net.signIn();
  const responses = new FakeNotificationResponseSource(options.initial ?? null);
  const blocker = new FakePushTapBlocker();
  const store = new FakePendingPushStore();
  store.saved = options.pending ?? null;
  const processed: unknown[] = [];
  const router = new PushTapRouter({
    responses,
    boot: boot.viewModel,
    sessionStore: net.sessionStore,
    blocker,
    store,
    processor: {
      process: async (input, origin) => {
        processed.push({ input, origin });
        return 'navigated';
      },
    },
  });
  const stop = router.start();
  await settle();
  return { boot: boot.viewModel, net, responses, blocker, store, router, processed, stop };
}
type Harness = Awaited<ReturnType<typeof setup>>;
const inputs = (h: Harness) =>
  h.processed.map((p) => (p as { input: { type: string } }).input.type);

describe('PushTapRouter 처리', () => {
  it('TC-PUSH-039 메인(회원)에서의 탭은 payload를 파싱해 push 출처로 즉시 처리한다', async () => {
    const h = await setup();
    h.boot.toMain('member');
    h.responses.tap(APPROVED);
    await settle();
    expect(h.processed).toEqual([
      {
        input: expect.objectContaining({
          type: 'POST_APPROVED',
          notificationId: '33333333-3333-4333-8333-333333333301',
          sourceId: '22222222-2222-4222-8222-222222222201',
        }),
        origin: 'push',
      },
    ]);
  });

  it('TC-PUSH-044 알 수 없는 payload도 처리기로 넘긴다(알림함 폴백은 처리기의 몫)', async () => {
    const h = await setup();
    h.boot.toMain('member');
    h.responses.tap(data('payload__unknown-type'));
    await settle();
    expect(h.processed).toHaveLength(1);
  });

  it('TC-PUSH-062 콜드 스타트 탭은 메인이 준비될 때까지 버퍼링했다가 정확히 1회 소비한다', async () => {
    const h = await setup({ initial: TOPIC });
    expect(h.processed).toHaveLength(0);
    h.boot.toMain('member');
    await settle();
    expect(inputs(h)).toEqual(['TOPIC']);
    h.boot.toMain('member');
    await settle();
    expect(inputs(h)).toEqual(['TOPIC']);
    expect(h.store.saved).toBeNull();
  });

  it('TC-PUSH-058 로그아웃 상태의 탭은 버리고 저장하지 않으며 이후 로그인해도 이동하지 않는다', async () => {
    const h = await setup({ signedIn: false });
    h.boot.toLogin();
    h.responses.tap(APPROVED);
    await settle();
    expect(h.processed).toHaveLength(0);
    expect(h.store.saved).toBeNull();
    h.boot.toMain('member');
    await settle();
    expect(h.processed).toHaveLength(0);
  });

  it('TC-PUSH-058 콜드 스타트 탭이 로그인 화면으로 끝나면(미인증) 폐기한다', async () => {
    const h = await setup({ initial: APPROVED, signedIn: false });
    h.boot.toLogin();
    await settle();
    h.boot.toMain('member');
    await settle();
    expect(h.processed).toHaveLength(0);
  });

  it('TC-PUSH-059 게스트의 탭은 버리고 앱만 열린다', async () => {
    const h = await setup({ signedIn: false });
    h.boot.toMain('guest');
    h.responses.tap(APPROVED);
    await settle();
    expect(h.processed).toHaveLength(0);
    expect(h.store.saved).toBeNull();
  });

  it('TC-PUSH-060 세션은 있지만 가입(사인 미리보기) 화면이면 보류했다가 메인 진입 뒤 처리한다', async () => {
    const h = await setup();
    h.boot.toSignUp({ idToken: 'i', rawNonce: 'n' });
    h.responses.tap(APPROVED);
    await settle();
    expect(h.processed).toHaveLength(0);
    expect(h.store.saved).not.toBeNull();
    h.boot.toMain('member');
    await settle();
    expect(inputs(h)).toEqual(['POST_APPROVED']);
    expect(h.store.saved).toBeNull();
  });

  it('TC-PUSH-061 업로드·피드백 작성 중(blocker)에는 보류했다가 화면을 벗어난 뒤 처리한다', async () => {
    const h = await setup();
    h.boot.toMain('member');
    h.blocker.set(true);
    h.responses.tap(APPROVED);
    await settle();
    expect(h.processed).toHaveLength(0);
    h.blocker.set(false);
    await settle();
    expect(inputs(h)).toEqual(['POST_APPROVED']);
  });

  it('TC-PUSH-063 보류 중인 탭을 저장소에 남기고, 새 탭은 이전 보류분을 교체하며, 재시작하면 복원해 소비한다', async () => {
    const h = await setup();
    h.boot.toMain('member');
    h.blocker.set(true);
    h.responses.tap(APPROVED);
    h.responses.tap(TOPIC);
    await settle();
    expect(h.store.saved).toEqual(TOPIC);
    h.stop();

    const restored = await setup({ pending: TOPIC });
    restored.boot.toMain('member');
    await settle();
    expect(inputs(restored)).toEqual(['TOPIC']);
    expect(restored.store.saved).toBeNull();
  });

  it('TC-PUSH-066 보류 중 계정이 바뀌면(세션 generation 변화) 폐기한다', async () => {
    const h = await setup();
    h.boot.toMain('member');
    h.blocker.set(true);
    h.responses.tap(APPROVED);
    await settle();
    await h.net.sessionStore.clear();
    await h.net.signIn({ userId: 'user-b' });
    h.blocker.set(false);
    await settle();
    expect(h.processed).toHaveLength(0);
    expect(h.store.saved).toBeNull();
  });

  it('REQ-AUTH-036 로그아웃(로그인 단계 진입) 시 보류 중이던 탭을 폐기한다', async () => {
    const h = await setup();
    h.boot.toMain('member');
    h.blocker.set(true);
    h.responses.tap(APPROVED);
    await settle();
    h.boot.toLogin();
    await settle();
    expect(h.store.saved).toBeNull();
    h.blocker.set(false);
    h.boot.toMain('member');
    await settle();
    expect(h.processed).toHaveLength(0);
  });

  it('stop 뒤에는 구독이 없다', async () => {
    const h = await setup();
    h.stop();
    expect(h.responses.listenerCount).toBe(0);
    expect(h.blocker.isBlocked()).toBe(false);
  });
});
