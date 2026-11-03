import { deferred } from '../../core/http/__testing__/FakeTransport';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter, type RouteValue } from '../../data/__testing__/FixtureRouter';
import { authorizationOf, pathOf } from '../../data/__testing__/requestAsserts';
import { SignatureRepository } from '../../data/signature/SignatureRepository';
import { t } from '../../shared/copy';
import { FakeAuthFlowNavigator } from '../auth/__testing__/FakeAuthFlowNavigator';
import { SignatureCardViewModel } from './SignatureCardViewModel';

const GET = 'GET /users/me/signature';
const SUCCESS = 'signature/users-me-signature__get-success';
const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

async function setup(first: RouteValue = SUCCESS) {
  const net = createNetHarness();
  await net.signIn();
  const router = new FixtureRouter({ [GET]: first }).install(net.transport);
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const vm = new SignatureCardViewModel({
    repository: new SignatureRepository({ api: net.api }),
    toast,
    navigator: { openSignatureChange: jest.fn() },
    authFlow,
  });
  return { ...net, router, toast, authFlow, vm };
}

const gets = (h: { transport: { requestsTo(m: string, p: string): unknown[] } }) =>
  h.transport.requestsTo('GET', '/users/me/signature');

const thumbOf = (fixture: string) =>
  fixtureBody<Record<string, string>>(fixture).signatureThumbnailImageUrl;

/** 열 때까지 미루는 GET 응답. */
function gated(fixture: string) {
  const gate = deferred<void>();
  const route: RouteValue = async () => {
    await gate.promise;
    return fixtureResponse(fixture);
  };
  return { route, release: () => gate.resolve() };
}

describe('SignatureCardViewModel 설정 탭 재조회 (SET)', () => {
  it('TC-SET-013 GET /users/me/signature를 Bearer 헤더로 부른다', async () => {
    const h = await setup();
    await h.vm.refresh();
    const request = h.router.calls(GET)[0];
    expect(request.method).toBe('GET');
    expect(pathOf(request)).toBe('/users/me/signature');
    expect(authorizationOf(request)).toBe('Bearer access-1');
  });

  it('TC-SET-004 이미 사인이 보이면 기존 사인을 유지한 채 재조회하고 응답이 오면 교체한다', async () => {
    const h = await setup();
    await h.vm.refresh();
    const before = h.vm.getSnapshot().imageUrl;
    const next = gated('signature/users-me-signature__get-thumbnail-null');
    h.router.set(GET, next.route);

    const refreshing = h.vm.refresh();
    expect(h.vm.getSnapshot()).toEqual({ imageUrl: before, loading: true, loadError: false });
    next.release();
    await refreshing;

    const body = fixtureBody<Record<string, string>>(
      'signature/users-me-signature__get-thumbnail-null',
    );
    expect(h.vm.getSnapshot().imageUrl).toBe(body.signatureOriginalImageUrl);
    expect(gets(h)).toHaveLength(2);
  });

  it('TC-SET-005 이미 사인이 보이는 상태에서 재조회가 실패하면 기존 사인을 유지하고 토스트만 띄운다', async () => {
    const h = await setup();
    await h.vm.refresh();
    const before = h.vm.getSnapshot().imageUrl;
    h.router.set(GET, 'signature/users-me-signature__get-internal-error');
    await h.vm.refresh();
    expect(h.vm.getSnapshot()).toEqual({ imageUrl: before, loading: false, loadError: false });
    expect(h.toast.messages).toEqual([t('sign.load.error')]);
  });

  it('TC-SET-006 최초 조회가 실패하면 loadError 상태가 되고 다시 시도하면 재조회해 사라진다', async () => {
    const h = await setup('signature/users-me-signature__get-internal-error');
    await h.vm.refresh();
    expect(h.vm.getSnapshot()).toEqual({ imageUrl: null, loading: false, loadError: true });
    expect(h.toast.messages).toEqual([]);

    h.router.set(GET, SUCCESS);
    await h.vm.refresh();
    expect(h.vm.getSnapshot()).toEqual({
      imageUrl: thumbOf(SUCCESS),
      loading: false,
      loadError: false,
    });
  });

  it('TC-SET-007 조회가 진행 중일 때 재진입 트리거를 여러 번 보내도 요청은 한 번이다', async () => {
    const h = await setup();
    const slow = gated(SUCCESS);
    h.router.set(GET, slow.route);
    const first = h.vm.refresh();
    void h.vm.refresh();
    void h.vm.refresh();
    slow.release();
    await first;
    expect(h.router.calls(GET)).toHaveLength(1);
  });

  it('TC-SET-009 변경 전에 시작된 조회가 진행 중일 때 변경 성공 뒤 그 응답이 도착해도 반영하지 않는다', async () => {
    const h = await setup();
    const staleGate = deferred<void>();
    h.router.set(GET, (_request, index) =>
      index === 0
        ? staleGate.promise.then(() =>
            fixtureResponse('signature/users-me-signature__get-thumbnail-null'),
          )
        : fixtureResponse(SUCCESS),
    );

    const old = h.vm.refresh();
    await flush(); // 낡은 조회 요청이 서버(Fake)에 도달한 뒤 변경이 끝난다
    await h.vm.onSignatureChanged();
    expect(h.vm.getSnapshot().imageUrl).toBe(thumbOf(SUCCESS));

    staleGate.resolve();
    await old;
    await flush();
    expect(h.vm.getSnapshot().imageUrl).toBe(thumbOf(SUCCESS));
    expect(h.vm.getSnapshot().loading).toBe(false);
  });

  it('TC-SET-010 변경이 실패해 재조회가 없으면 진행 중이던 조회 응답은 정상 반영된다', async () => {
    const h = await setup();
    const slow = gated(SUCCESS);
    h.router.set(GET, slow.route);
    const refreshing = h.vm.refresh();
    slow.release();
    await refreshing;
    expect(h.vm.getSnapshot().imageUrl).toBe(thumbOf(SUCCESS));
  });

  it('TC-SET-011 변경 성공 뒤 onSignatureChanged는 GET으로 재조회한 썸네일로 즉시 바꾼다(PUT 응답 URL 대입 아님)', async () => {
    const h = await setup();
    await h.vm.refresh();
    h.router.set(GET, 'signature/users-me-signature__get-thumbnail-null');
    await h.vm.onSignatureChanged();
    const body = fixtureBody<Record<string, string>>(
      'signature/users-me-signature__get-thumbnail-null',
    );
    expect(h.vm.getSnapshot().imageUrl).toBe(body.signatureOriginalImageUrl);
    expect(gets(h)).toHaveLength(2);
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
  });

  it('TC-SET-012 401은 refresh 뒤 1회 재전송하고 성공하면 사인을 보인다', async () => {
    const h = await setup();
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    h.router.set(GET, (request) =>
      authorizationOf(request) === 'Bearer access-1'
        ? fixtureResponse('signature/users-me-signature__get-unauthorized')
        : fixtureResponse(SUCCESS),
    );
    await h.vm.refresh();
    expect(h.vm.getSnapshot().imageUrl).toBe(thumbOf(SUCCESS));
    expect(h.router.calls(GET)).toHaveLength(2);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SET-012 REAUTHENTICATION_REQUIRED면 토스트도 화면 이동도 직접 하지 않는다(세션 이벤트가 로그인으로 보낸다)', async () => {
    const h = await setup('signature/users-me-signature__get-unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__reauthentication-required');
    await h.vm.refresh();
    expect(h.toast.messages).toEqual([]);
    expect(h.authFlow.calls).toEqual([]);
    expect(h.emitted.map((e) => e.type)).toContain('session-expired');
  });

  it('TC-SET-012 갱신 뒤에도 남은 401이면 로그인 화면으로 보낸다', async () => {
    const h = await setup('signature/users-me-signature__get-unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    await h.vm.refresh();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
    expect(h.vm.getSnapshot().loadError).toBe(false);
  });

  it('TC-SET-037 clearAll(계정 전환) 뒤에는 이전 계정의 사인이 보이지 않고 늦은 응답도 반영하지 않는다', async () => {
    const h = await setup();
    await h.vm.refresh();
    const slow = gated(SUCCESS);
    h.router.set(GET, slow.route);
    const refreshing = h.vm.refresh();
    await h.vm.clearAll();
    expect(h.vm.getSnapshot()).toEqual({ imageUrl: null, loading: false, loadError: false });
    slow.release();
    await refreshing;
    await flush();
    expect(h.vm.getSnapshot().imageUrl).toBeNull();
    expect(h.toast.messages).toEqual([]);
  });
});
