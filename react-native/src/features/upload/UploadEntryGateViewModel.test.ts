import { FakeAnalyticsTracker } from '../../core/analytics/__testing__/FakeAnalyticsTracker';
import {
  createNetHarness,
  reauth,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { deferred, json, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter, type RouteValue } from '../../data/__testing__/FixtureRouter';
import { PostRepository } from '../../data/post/PostRepository';
import { t } from '../../shared/copy';
import { FakeAuthFlowNavigator } from '../auth/__testing__/FakeAuthFlowNavigator';
import type { MainMode } from '../auth/AuthFlowNavigator';
import { FakeUploadNavigator } from './__testing__/FakeUploadNavigator';
import { UploadEntryGateViewModel } from './UploadEntryGateViewModel';

const TODAY = 'GET /posts/today';
const flush = async () => {
  for (let i = 0; i < 60; i += 1) await Promise.resolve();
};

async function setup(routes: Record<string, RouteValue> = {}, mode: MainMode = 'member') {
  const net = createNetHarness();
  if (mode === 'member') await net.signIn();
  const router = new FixtureRouter({
    [TODAY]: 'home/posts-today__not-posted',
    'POST /auth/refresh': refreshOk(),
    ...routes,
  }).install(net.transport);
  const toast = new FakeToastPresenter();
  const navigator = new FakeUploadNavigator();
  const authFlow = new FakeAuthFlowNavigator();
  const analytics = new FakeAnalyticsTracker();
  const viewModel = new UploadEntryGateViewModel({
    mode,
    posts: new PostRepository({ api: net.api }),
    toast,
    authFlow,
    navigator,
    analytics,
  });
  return { ...net, router, toast, navigator, authFlow, analytics, viewModel };
}

describe('UploadEntryGateViewModel', () => {
  it('TC-UPL-001 게스트는 토스트만 띄우고 네트워크 요청 0건, 화면도 열리지 않는다(D-05)', async () => {
    const h = await setup({}, 'guest');
    await h.viewModel.press();
    expect(h.toast.messages).toEqual([t('upload.gate.login-required')]);
    expect(h.transport.requests).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
    expect(h.viewModel.getSnapshot().checking).toBe(false);
  });

  it('TC-UPL-002 회원은 GET /posts/today를 1회 부르고 미작성이면 응답 topicDate로 업로드 화면을 연다', async () => {
    const h = await setup();
    await h.viewModel.press();
    expect(h.router.calls(TODAY)).toHaveLength(1);
    expect(h.navigator.calls).toEqual([{ type: 'open-upload', topicDate: '2026-10-27' }]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-UPL-002 화면에 고정하는 날짜는 시계가 아니라 응답의 topicDate다', async () => {
    const h = await setup({ [TODAY]: 'upload/posts-today__topic-date-changed' });
    await h.viewModel.press();
    expect(h.navigator.ofType('open-upload')).toEqual([
      { type: 'open-upload', topicDate: '2026-10-28' },
    ]);
  });

  it.each([
    'home/posts-today__posted-validating',
    'home/posts-today__posted-pending',
    'home/posts-today__posted-approved',
  ])('TC-UPL-003 %s 이면 이미 작성 안내를 보여 주고 화면을 열지 않는다', async (fixture) => {
    const h = await setup({ [TODAY]: fixture });
    await h.viewModel.press();
    expect(h.toast.messages).toEqual([t('upload.gate.already-posted')]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-004 /posts/today 404면 참여할 주제 없음 안내다', async () => {
    const h = await setup({ [TODAY]: 'home/posts-today__404-no-open-topic' });
    await h.viewModel.press();
    expect(h.toast.messages).toEqual([t('upload.gate.no-open-topic')]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-005 정지 회원(403)은 정지 안내를 보여 주고 같은 요청을 다시 보내지 않는다', async () => {
    const h = await setup({ [TODAY]: 'home/posts-today__403-banned' });
    await h.viewModel.press();
    expect(h.toast.messages).toEqual([t('upload.gate.banned')]);
    expect(h.router.calls(TODAY)).toHaveLength(1);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-006 401은 refresh 후 1회 재전송하고 통과하면 화면을 연다', async () => {
    const h = await setup({
      [TODAY]: [unauthorized(), fixtureResponse('home/posts-today__not-posted')],
    });
    await h.viewModel.press();
    expect(h.router.calls(TODAY)).toHaveLength(2);
    expect(h.router.calls('POST /auth/refresh')).toHaveLength(1);
    expect(h.navigator.ofType('open-upload')).toHaveLength(1);
  });

  it('TC-UPL-006 REAUTHENTICATION_REQUIRED면 토스트 없이 세션 만료 흐름에 맡기고 화면을 열지 않는다', async () => {
    const h = await setup({ [TODAY]: unauthorized(), 'POST /auth/refresh': reauth() });
    await h.viewModel.press();
    expect(h.toast.messages).toEqual([]);
    expect(h.navigator.calls).toEqual([]);
    expect(h.emitted).toHaveLength(1);
  });

  it('D-17 갱신 뒤에도 401 UNAUTHORIZED면 로그인 화면으로 보낸다', async () => {
    const h = await setup({ [TODAY]: unauthorized() });
    await h.viewModel.press();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.navigator.calls).toEqual([]);
  });

  it.each([
    ['서버 오류 500', 'home/posts-today__500-server-error'],
    ['연결 실패', networkFailure()],
    ['알 수 없는 moderationStatus', 'home/posts-today__unknown-status'],
  ] as [string, RouteValue][])(
    'TC-UPL-007 %s는 일반 확인 실패 문구이고 화면을 열지 않는다',
    async (_name, route) => {
      const h = await setup({ [TODAY]: route });
      await h.viewModel.press();
      expect(h.toast.messages).toEqual([t('upload.gate.check-failed')]);
      expect(h.navigator.calls).toEqual([]);
    },
  );

  it.each(['upload/posts-today__invalid-not-posted-with-post'])(
    'TC-UPL-008 계약 위반(%s)은 일반 확인 실패 문구다',
    async (fixture) => {
      // not-posted-after-reject는 정상 응답(isPosted=false, TC-HOME-010)이라 계약 위반이 아니다. REJECTED 조합은 아래 별도 테스트가 다룬다.
      const h = await setup({ [TODAY]: fixture });
      await h.viewModel.press();
      expect(h.toast.messages).toEqual([t('upload.gate.check-failed')]);
      expect(h.navigator.calls).toEqual([]);
    },
  );

  it('TC-UPL-008 isPosted=true인데 moderationStatus가 REJECTED인 응답은 계약 위반이다', async () => {
    const h = await setup({
      [TODAY]: json(200, {
        topicDate: '2026-10-27',
        isPosted: true,
        postId: '22222222-2222-4222-8222-222222222201',
        moderationStatus: 'REJECTED',
      }),
    });
    await h.viewModel.press();
    expect(h.toast.messages).toEqual([t('upload.gate.check-failed')]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-009 확인 중 연타해도 GET /posts/today는 1회만 나가고 checking이 켜진다', async () => {
    const gate = deferred<void>();
    const h = await setup({
      [TODAY]: async () => {
        await gate.promise;
        return fixtureResponse('home/posts-today__not-posted');
      },
    });
    const first = h.viewModel.press();
    await flush();
    expect(h.viewModel.getSnapshot().checking).toBe(true);
    void h.viewModel.press();
    void h.viewModel.press();
    await flush();
    expect(h.router.calls(TODAY)).toHaveLength(1);

    gate.resolve();
    await first;
    expect(h.viewModel.getSnapshot().checking).toBe(false);
    expect(h.navigator.ofType('open-upload')).toHaveLength(1);
  });

  it('TC-UPL-009 확인이 끝난 뒤에는 다시 누를 수 있다', async () => {
    const h = await setup({ [TODAY]: 'home/posts-today__posted-pending' });
    await h.viewModel.press();
    await h.viewModel.press();
    expect(h.router.calls(TODAY)).toHaveLength(2);
  });

  it('TC-UPL-010 대기 중 화면을 정리하면 요청이 취소되고 뒤늦게 응답이 와도 화면이 열리지 않는다', async () => {
    const gate = deferred<void>();
    const h = await setup({
      [TODAY]: async () => {
        await gate.promise;
        return fixtureResponse('home/posts-today__not-posted');
      },
    });
    const pending = h.viewModel.press();
    await flush();
    h.viewModel.dispose();
    expect(h.transport.requests[0].options.signal?.aborted).toBe(true);
    gate.resolve();
    await pending;
    expect(h.navigator.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-UPL-010 정리한 뒤 뒤늦게 시작한 press는 요청을 보내지 않는다', async () => {
    const h = await setup();
    h.viewModel.dispose();
    await h.viewModel.press();
    expect(h.router.calls(TODAY)).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
  });
});
