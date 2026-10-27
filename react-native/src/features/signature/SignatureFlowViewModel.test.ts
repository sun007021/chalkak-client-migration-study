import { deferred } from '../../core/http/__testing__/FakeTransport';
import { routeFixtures } from './__testing__/routes';
import { SIGNATURE_MAX_BYTES } from '../../shared/constants';
import { t } from '../../shared/copy';
import { drawLine, flush } from './__testing__/draw';
import { createChangeHarness } from './__testing__/createChangeHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';

const OK = {
  'POST /users/me/signature/uploads': 'signature/users-me-signature-uploads__success',
  'PUT /__upload': 'signature/presigned-put__ok',
  'PUT /users/me/signature': 'signature/users-me-signature__put-success',
} as const;

describe('SignatureFlowViewModel (change 모드)', () => {
  it('TC-SIGN-043 변경 화면 진입 시 screen_view가 change_signature, change_signature_preview 순으로 한 번씩 전송된다', async () => {
    const h = createChangeHarness();
    await h.reachPreview();
    expect(h.analytics.screenNames).toEqual(['change_signature', 'change_signature_preview']);
    h.flow.draw.getSnapshot();
    expect(h.analytics.screenNames).toHaveLength(2); // 조회·리렌더로 늘지 않는다
  });

  it('TC-SIGN-008 "이 사인으로 할래요"를 연타해도 미리보기는 한 번만 열린다', async () => {
    const h = createChangeHarness();
    await h.signIn();
    h.flow.start();
    drawLine(h.flow.draw);
    await Promise.all([h.flow.draw.confirm(), h.flow.draw.confirm(), h.flow.draw.confirm()]);
    expect(h.flow.getSnapshot().step).toBe('preview');
    expect(h.analytics.screenNames.filter((n) => n === 'change_signature_preview')).toHaveLength(1);
    expect(h.rasterizer.requests).toHaveLength(1);
  });

  it('TC-SIGN-015 1 MiB 초과면 미리보기로 가지 않고 서버 요청도 0건이다', async () => {
    const h = createChangeHarness();
    await h.signIn();
    h.rasterizer.setSize(SIGNATURE_MAX_BYTES + 1);
    h.flow.start();
    drawLine(h.flow.draw);
    await h.flow.draw.confirm();
    expect(h.flow.getSnapshot().step).toBe('draw');
    expect(h.flow.draw.getSnapshot().error).toBe(t('sign.error.too-large'));
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-SIGN-018 미리보기에서 "다시 그리기"를 누르면 그리기로 돌아가 새로 그린다(이전 획 지움) [임시: 확인 필요 2]', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    preview.redraw();
    expect(h.flow.getSnapshot().step).toBe('draw');
    expect(h.flow.preview).toBeNull();
    expect(h.flow.draw.getSnapshot().strokes).toEqual([]);
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-SIGN-042 그리기에서 뒤로가면 onExit를 한 번 부르고 서버 호출은 0건이다', async () => {
    const h = createChangeHarness();
    await h.signIn();
    h.flow.start();
    drawLine(h.flow.draw);
    h.flow.back();
    expect(h.hostCalls).toEqual({ completed: 0, exited: 1 });
    expect(h.transport.requests).toHaveLength(0);
  });

  it('REQ-ONB-027 미리보기에서 뒤로가면 그리기로 돌아간다(획 유지)', async () => {
    const h = createChangeHarness();
    await h.reachPreview();
    h.flow.back();
    expect(h.flow.getSnapshot().step).toBe('draw');
    expect(h.flow.draw.getSnapshot().strokes).toHaveLength(1);
    expect(h.hostCalls.exited).toBe(0);
  });

  it('TC-SIGN-019 TC-SIGN-025 TC-SIGN-027 성공하면 토스트 sign.change.done을 보이고 onCompleted를 한 번 부른다. 응답 URL은 쓰지 않고 호출 순서는 uploads, PUT, 확정이다', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, OK);
    await preview.confirm();
    expect(h.toast.messages).toEqual([t('sign.change.done')]);
    expect(h.hostCalls.completed).toBe(1);
    expect(h.transport.requests).toHaveLength(3);
  });

  it('TC-SIGN-036 "사인 변경하기" 연타 시 uploads 1회, PUT 1회, 확정 1회이다', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, OK);
    await Promise.all([preview.confirm(), preview.confirm(), preview.confirm()]);
    expect(h.transport.requestsTo('POST', '/users/me/signature/uploads')).toHaveLength(1);
    expect(h.transport.requestsTo('PUT', '/users/me/signature')).toHaveLength(1);
    expect(
      h.transport.requests.filter((r) => new URL(r.url).pathname.startsWith('/__upload')),
    ).toHaveLength(1);
  });

  it('TC-SIGN-029 서버가 사인을 거절하면 그리기로 돌아가 sign.error.invalid를 보이고 획은 유지한다', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'PUT /users/me/signature': 'signature/users-me-signature__put-invalid-signature',
    });
    await preview.confirm();
    expect(h.flow.getSnapshot().step).toBe('draw');
    expect(h.flow.draw.getSnapshot().error).toBe(t('sign.error.invalid'));
    expect(h.flow.draw.getSnapshot().strokes).toHaveLength(1);
    expect(h.hostCalls.completed).toBe(0);
  });

  it('TC-SIGN-028 SIGNATURE_REUPLOAD_REQUIRED면 onb.signup.error.reupload를 보이고 다음 시도는 새 uploads부터이다', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    h.transport.respond((request) => {
      const path = new URL(request.url).pathname;
      if (
        request.method === 'PUT' &&
        path === '/api/v1/users/me/signature' &&
        h.transport.requestsTo('PUT', '/users/me/signature').length === 1
      ) {
        return {
          status: 400,
          headers: { 'content-type': 'application/json' },
          bodyText: JSON.stringify({ errorCode: 'SIGNATURE_REUPLOAD_REQUIRED', message: 'x' }),
        };
      }
      if (path.startsWith('/__upload')) return fixtureResponse(OK['PUT /__upload']);
      if (path.endsWith('/uploads')) return fixtureResponse(OK['POST /users/me/signature/uploads']);
      return fixtureResponse(OK['PUT /users/me/signature']);
    });
    await preview.confirm();
    expect(preview.getSnapshot().error).toMatchObject({ message: t('onb.signup.error.reupload') });
    await preview.confirm();
    expect(h.transport.requestsTo('POST', '/users/me/signature/uploads')).toHaveLength(2);
    expect(h.hostCalls.completed).toBe(1);
  });

  it('TC-SIGN-033 refresh까지 실패하면 로그인으로 보내고 sign.error.expired 토스트', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'PUT /users/me/signature': 'signature/users-me-signature__put-unauthorized',
      'POST /auth/refresh': 'auth/refresh__reauthentication-required',
    });
    await preview.confirm();
    expect(h.navigator.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([t('sign.error.expired')]);
  });

  it('TC-SIGN-035 업로드 발급이 500이면 백오프 재시도 후 sign.change.error.generic을 보이고 기존 사인·미리보기는 유지된다', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /users/me/signature/uploads': 'signature/users-me-signature__put-internal-error',
    });
    await preview.confirm();
    expect(h.transport.requestsTo('POST', '/users/me/signature/uploads')).toHaveLength(3);
    expect(preview.getSnapshot().error).toMatchObject({ message: t('sign.change.error.generic') });
    expect(h.flow.getSnapshot().step).toBe('preview');
    expect(h.flow.draw.getSnapshot().strokes).toHaveLength(1);
  });

  it('TC-SIGN-037 변경 진행 중 뒤로가기: 그리기로 돌아가고 요청은 취소되며 오류·토스트가 보이지 않는다', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    const gate = deferred<void>();
    h.transport.respond(async (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/uploads')) {
        await gate.promise;
        return fixtureResponse(OK['POST /users/me/signature/uploads']);
      }
      throw new Error(`취소 뒤에는 요청이 없어야 한다 ${path}`);
    });
    const pending = preview.confirm();
    await flush();
    h.flow.back();
    expect(h.flow.getSnapshot().step).toBe('draw');
    gate.resolve();
    await pending;
    await flush();
    expect(h.transport.requestsTo('PUT', '/users/me/signature')).toHaveLength(0);
    expect(h.toast.messages).toEqual([]);
    expect(h.hostCalls.completed).toBe(0);
    expect(h.flow.draw.getSnapshot().error).toBeNull();
  });

  it('TC-SIGN-038 변경 진행 중 로그아웃(세션 변경)되면 응답이 도착해도 완료 처리·토스트를 하지 않는다', async () => {
    const h = createChangeHarness();
    const preview = await h.reachPreview();
    const gate = deferred<void>();
    h.transport.respond(async (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/uploads')) return fixtureResponse(OK['POST /users/me/signature/uploads']);
      if (path.startsWith('/__upload')) return fixtureResponse(OK['PUT /__upload']);
      await gate.promise; // 확정 PUT 응답을 붙잡는다
      return fixtureResponse(OK['PUT /users/me/signature']);
    });
    const pending = preview.confirm();
    await flush();
    await h.sessionStore.clear(); // 로그아웃
    gate.resolve();
    await pending;
    expect(h.hostCalls.completed).toBe(0);
    expect(h.toast.messages).toEqual([]);
  });
});
