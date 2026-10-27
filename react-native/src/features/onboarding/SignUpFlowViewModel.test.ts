import { deferred, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { TERMS_URLS, SIGNATURE_MAX_BYTES } from '../../shared/constants';
import { t } from '../../shared/copy';
import { flush } from '../signature/__testing__/draw';
import { routeFixtures, type RouteStep } from '../signature/__testing__/routes';
import { createSignUpHarness, PENDING } from './__testing__/createSignUpHarness';

const OK: Record<string, RouteStep | RouteStep[]> = {
  'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__success',
  'PUT /__upload': 'onboarding/presigned-put__ok',
  'POST /auth/social-signup': 'onboarding/signup__success',
};
const PENDING_STEP = 'onboarding/signup__signature-processing-pending';

describe('SignUpFlowViewModel: 약관', () => {
  it('TC-ONB-002 TC-ONB-049 처음에는 약관 단계이고 screen_view terms가 한 번 나간다', () => {
    const h = createSignUpHarness();
    h.flow.start();
    expect(h.flow.getSnapshot()).toEqual({ step: 'terms', openDocument: null });
    expect(h.flow.signature).toBeNull();
    expect(h.flow.document).toBeNull();
    expect(h.analytics.screenNames).toEqual(['terms']);
  });

  it('TC-ONB-008 TC-ONB-049 "보기"는 문서 시트를 열고 screen_view terms_of_service / privacy_policy를 보낸다', async () => {
    const h = createSignUpHarness();
    h.flow.start();
    h.flow.terms.openDocument('service');
    expect(h.flow.getSnapshot().openDocument).toBe('service');
    await flush();
    expect(h.flow.document!.getSnapshot().inAppUrl).toBe(TERMS_URLS.service);
    h.flow.closeDocument();
    h.flow.terms.openDocument('privacy');
    await flush();
    expect(h.flow.document!.getSnapshot().inAppUrl).toBe(TERMS_URLS.privacy);
    expect(h.analytics.screenNames).toEqual(['terms', 'terms_of_service', 'privacy_policy']);
  });

  it('TC-ONB-014 문서 시트를 열었다 닫아도 체크 상태가 유지된다', () => {
    const h = createSignUpHarness();
    h.flow.start();
    h.flow.terms.toggleAll();
    h.flow.terms.openDocument('service');
    h.flow.closeDocument();
    expect(h.flow.getSnapshot().openDocument).toBeNull();
    expect(h.flow.document).toBeNull();
    expect(h.flow.terms.getSnapshot().canProceed).toBe(true);
  });

  it('TC-ONB-014 문서 시트가 열려 있을 때 뒤로가면 시트만 닫히고 로그인으로 가지 않는다', () => {
    const h = createSignUpHarness();
    h.flow.start();
    h.flow.terms.openDocument('privacy');
    h.flow.back();
    expect(h.flow.getSnapshot().openDocument).toBeNull();
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-ONB-015 두 항목 동의 후 "다음"이면 사인 그리기 단계가 열리고 screen_view onboarding_signature가 나간다', () => {
    const h = createSignUpHarness();
    h.flow.start();
    h.flow.terms.next(); // 동의 전에는 무시
    expect(h.flow.getSnapshot().step).toBe('terms');
    h.flow.terms.toggleAll();
    h.flow.terms.next();
    expect(h.flow.getSnapshot().step).toBe('signature');
    expect(h.flow.signature).not.toBeNull();
    expect(h.analytics.screenNames).toEqual(['terms', 'onboarding_signature']);
  });

  it('TC-ONB-017 TC-ONB-027 약관에서 뒤로가면 toLogin을 부른다(컨텍스트 폐기는 소유자 dispose로)', () => {
    const h = createSignUpHarness();
    h.flow.start();
    h.flow.back();
    expect(h.navigator.calls).toEqual(['login']);
  });

  it('REQ-ONB-027 사인 그리기에서 뒤로가면 약관으로 돌아가고 동의 상태는 유지된다, 사인 흐름은 버려진다', () => {
    const h = createSignUpHarness();
    h.flow.start();
    h.flow.terms.toggleAll();
    h.flow.terms.next();
    h.flow.back();
    expect(h.flow.getSnapshot().step).toBe('terms');
    expect(h.flow.signature).toBeNull();
    expect(h.flow.terms.getSnapshot().canProceed).toBe(true);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-ONB-016 약관을 거치는 동안 서버 요청이 0건이다', () => {
    const h = createSignUpHarness();
    h.flow.start();
    h.flow.terms.toggleAll();
    h.flow.terms.openDocument('service');
    h.flow.closeDocument();
    h.flow.terms.next();
    expect(h.transport.requests).toHaveLength(0);
  });
});

describe('SignUpFlowViewModel: 사인 -> 미리보기 -> 가입', () => {
  it('TC-ONB-049 화면 진입 screen_view가 terms, onboarding_signature, onboarding_signature_preview 순으로 한 번씩이다', async () => {
    const h = createSignUpHarness();
    await h.reachPreview();
    expect(h.analytics.screenNames).toEqual([
      'terms',
      'onboarding_signature',
      'onboarding_signature_preview',
    ]);
  });

  it('TC-ONB-048 가입 모드 미리보기이다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    expect(preview.getSnapshot().mode).toBe('onboarding');
    expect(h.flow.signature!.mode).toBe('onboarding');
  });

  it('TC-ONB-019 TC-ONB-024 TC-ONB-025 TC-ONB-047 "시작하기"로 가입이 끝나면 세션 저장, 푸시 등록 시작, 메인(member)으로 이동한다. 추가 social-login은 없다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, OK);
    await preview.confirm();

    expect(h.navigator.calls).toEqual(['main:member']);
    expect(h.push.registerCalls).toBe(1);
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
    expect(h.transport.requestsTo('POST', '/auth/social-login')).toHaveLength(0);
    expect(h.transport.requests.map((r) => r.method)).toEqual(['POST', 'PUT', 'POST']);
  });

  it('TC-ONB-016 가입 요청 어디에도 약관 동의 관련 필드가 없다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, OK);
    await preview.confirm();
    for (const request of h.transport.requests) {
      expect(String(request.body ?? '')).not.toMatch(/agree|terms|consent|동의/i);
    }
  });

  it('TC-ONB-043 "시작하기" 3회 연타해도 uploads, PUT, signup은 각 1회뿐이다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, OK);
    await Promise.all([preview.confirm(), preview.confirm(), preview.confirm()]);
    expect(h.transport.requests).toHaveLength(3);
    expect(h.navigator.calls).toEqual(['main:member']);
  });

  it('TC-ONB-017 PENDING 대기 중에도 busy가 유지되고 끝나야 메인으로 간다', async () => {
    const h = createSignUpHarness({ manualSleeper: true });
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup': [PENDING_STEP, 'onboarding/signup__success'],
    });
    const pending = preview.confirm();
    await flush();
    expect(preview.getSnapshot().busy).toBe(true);
    expect(h.navigator.calls).toEqual([]);
    h.pollSleeper.release();
    await pending;
    expect(preview.getSnapshot().busy).toBe(false);
    expect(h.navigator.calls).toEqual(['main:member']);
  });

  it('TC-ONB-028 TC-ONB-029 PENDING이 끝나지 않으면 onb.signup.error.timeout을 보이고 사인은 유지하며, 다시 누르면 새 uploads부터 시작한다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, { ...OK, 'POST /auth/social-signup': PENDING_STEP });
    await preview.confirm();
    expect(preview.getSnapshot().error).toMatchObject({ message: t('onb.signup.error.timeout') });
    expect(h.transport.requestsTo('POST', '/auth/social-signup')).toHaveLength(11);
    expect(h.flow.signature!.draw.getSnapshot().strokes).toHaveLength(1);
    expect(h.navigator.calls).toEqual([]);

    preview.dismissError();
    routeFixtures(h.transport, OK);
    await preview.confirm();
    expect(h.transport.requestsTo('POST', '/auth/social-signup/signature/uploads')).toHaveLength(2);
    expect(h.navigator.calls).toEqual(['main:member']);
  });

  it('TC-ONB-030 PENDING 재시도 중 401이면 로그인으로 돌아가고 sign.error.expired를 보인다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup': [PENDING_STEP, 'onboarding/signup__unauthorized'],
    });
    await preview.confirm();
    expect(h.navigator.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([t('sign.error.expired')]);
    expect(h.push.registerCalls).toBe(0);
  });

  it('TC-ONB-031 업로드 발급이 400(이미 가입)이면 social-login 재호출 LOGIN_SUCCESS로 메인에 간다(PUT·signup 없음)', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__already-registered',
      'POST /auth/social-login': 'auth/social-login__login-success',
    });
    await preview.confirm();
    expect(h.navigator.calls).toEqual(['main:member']);
    expect(h.push.registerCalls).toBe(1);
    expect(h.transport.requests).toHaveLength(2);
  });

  it('TC-ONB-031 재로그인도 SIGN_UP_REQUIRED면 onb.signup.error.generic', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__already-registered',
      'POST /auth/social-login': 'auth/social-login__sign-up-required',
    });
    await preview.confirm();
    expect(preview.getSnapshot().error).toMatchObject({ message: t('onb.signup.error.generic') });
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-ONB-032 업로드 발급 403(차단)이면 서버 message를 보이고 로그인 화면으로 돌아간다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__forbidden-banned',
    });
    await preview.confirm();
    const { message } = fixtureBody<{ message: string }>(
      'onboarding/signup-uploads__forbidden-banned',
    );
    expect(h.toast.messages).toEqual([message]);
    expect(h.navigator.calls).toEqual(['login']);
  });

  it('TC-ONB-033 업로드 발급 401이면 로그인 복귀 + sign.error.expired', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__unauthorized',
    });
    await preview.confirm();
    expect(h.navigator.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([t('sign.error.expired')]);
  });

  it('TC-ONB-034 이미 사용된 토큰(400)이어도 message가 아니라 상태·코드로 분기해 sign.error.invalid + 그리기로 [카탈로그와 충돌: 보고서 참고]', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup': 'onboarding/signup__already-used-token',
    });
    await preview.confirm();
    expect(h.flow.getSnapshot().step).toBe('signature');
    expect(h.flow.signature!.getSnapshot().step).toBe('draw');
    expect(h.flow.signature!.draw.getSnapshot().error).toBe(t('sign.error.invalid'));
  });

  it('TC-ONB-035 서버가 사인을 거절하면 사인 그리기로 돌아가 문구를 보이고 획은 유지한다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup': 'onboarding/signup__invalid-signature',
    });
    await preview.confirm();
    expect(h.flow.signature!.getSnapshot().step).toBe('draw');
    expect(h.flow.signature!.draw.getSnapshot()).toMatchObject({ error: t('sign.error.invalid') });
    expect(h.flow.signature!.draw.getSnapshot().strokes).toHaveLength(1);
  });

  it('TC-ONB-036 업로드 없음(404)이면 onb.signup.error.reupload를 보이고 다음 시도는 새 uploads부터이다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup': [
        'onboarding/signup__upload-not-found',
        'onboarding/signup__success',
      ],
    });
    await preview.confirm();
    expect(preview.getSnapshot().error).toMatchObject({ message: t('onb.signup.error.reupload') });
    preview.dismissError();
    await preview.confirm();
    expect(h.transport.requestsTo('POST', '/auth/social-signup/signature/uploads')).toHaveLength(2);
    expect(h.navigator.calls).toEqual(['main:member']);
  });

  it('TC-ONB-037 가입 확정 403이면 서버 message를 보여 준다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup': 'onboarding/signup__forbidden-banned',
    });
    await preview.confirm();
    const { message } = fixtureBody<{ message: string }>('onboarding/signup__forbidden-banned');
    expect(h.toast.messages).toEqual([message]);
  });

  it('TC-ONB-040 presigned PUT 403이면 signup 호출 0건이고 일반 실패 문구, 다음 시도는 새 uploads부터이다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'PUT /__upload': ['onboarding/presigned-put__expired', 'onboarding/presigned-put__ok'],
    });
    await preview.confirm();
    expect(preview.getSnapshot().error).toMatchObject({ message: t('onb.signup.error.generic') });
    expect(h.transport.requestsTo('POST', '/auth/social-signup')).toHaveLength(0);
    preview.dismissError();
    await preview.confirm();
    expect(h.transport.requestsTo('POST', '/auth/social-signup/signature/uploads')).toHaveLength(2);
  });

  it('TC-ONB-041 네트워크 오류면 sign.error.network를 보이고 사인은 유지하며 다시 누를 수 있다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, {
      ...OK,
      'POST /auth/social-signup/signature/uploads': networkFailure(),
    });
    await preview.confirm();
    expect(preview.getSnapshot().error).toMatchObject({ message: t('sign.error.network') });
    expect(preview.getSnapshot().busy).toBe(false);
    expect(h.flow.signature!.draw.getSnapshot().strokes).toHaveLength(1);
    // 가입 POST 발급은 자동 재시도하지 않는다(D-21).
    expect(h.transport.requestsTo('POST', '/auth/social-signup/signature/uploads')).toHaveLength(1);
  });

  it('TC-ONB-042 500이면 일반 실패 문구이고 자동 재시도는 없다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    routeFixtures(h.transport, { ...OK, 'POST /auth/social-signup': 'common/error__internal-500' });
    await preview.confirm();
    expect(preview.getSnapshot().error).toMatchObject({ message: t('onb.signup.error.generic') });
    expect(h.transport.requestsTo('POST', '/auth/social-signup')).toHaveLength(1);
  });

  it('TC-SIGN-015 1 MiB 초과 사인은 가입 요청 0건이다', async () => {
    const h = createSignUpHarness();
    h.rasterizer.setSize(SIGNATURE_MAX_BYTES + 1);
    h.flow.start();
    h.flow.terms.toggleAll();
    h.flow.terms.next();
    const draw = h.flow.signature!.draw;
    draw.beginStroke({ x: 10, y: 10 });
    draw.endStroke();
    await draw.confirm();
    expect(h.flow.signature!.getSnapshot().step).toBe('draw');
    expect(draw.getSnapshot().error).toBe(t('sign.error.too-large'));
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-ONB-044 가입 진행 중 뒤로가기: 요청이 취소되고 응답이 와도 세션 저장·이동·푸시가 없다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    const gate = deferred<void>();
    h.transport.respond(async (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/signature/uploads'))
        return fixtureResponse('onboarding/signup-uploads__success');
      if (path.startsWith('/__upload')) return fixtureResponse('onboarding/presigned-put__ok');
      await gate.promise;
      return fixtureResponse('onboarding/signup__success');
    });
    const pending = preview.confirm();
    await flush();
    h.flow.back(); // 미리보기 -> 그리기
    expect(h.flow.signature!.getSnapshot().step).toBe('draw');
    gate.resolve();
    await pending;
    await flush();
    expect((await h.sessionStore.load()).kind).not.toBe('authenticated');
    expect(h.navigator.calls).toEqual([]);
    expect(h.push.registerCalls).toBe(0);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-ONB-044 흐름 자체를 버려도(dispose) 진행 중 결과를 버린다', async () => {
    const h = createSignUpHarness();
    const preview = await h.reachPreview();
    const gate = deferred<void>();
    h.transport.respond(async (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/signature/uploads')) {
        await gate.promise;
        return fixtureResponse('onboarding/signup-uploads__success');
      }
      throw new Error('취소 뒤에는 요청이 없어야 한다');
    });
    const pending = preview.confirm();
    await flush();
    h.flow.dispose();
    gate.resolve();
    await pending;
    expect(h.navigator.calls).toEqual([]);
    expect((await h.sessionStore.load()).kind).not.toBe('authenticated');
  });

  it('TC-ONB-046 가입 시도 1회 안에서 같은 idToken·rawNonce 쌍이 업로드 발급에 쓰인다', async () => {
    const h = createSignUpHarness({ pending: { idToken: 'tok-A', rawNonce: 'nonce-A' } });
    const preview = await h.reachPreview();
    routeFixtures(h.transport, OK);
    await preview.confirm();
    expect(JSON.parse(h.transport.requests[0].body as string)).toMatchObject({
      idToken: 'tok-A',
      rawNonce: 'nonce-A',
    });
    expect(PENDING.idToken).not.toBe('tok-A');
  });
});
