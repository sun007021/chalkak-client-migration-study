import { deferred, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { TERMS_URLS } from '../../shared/constants';
import { t } from '../../shared/copy';
import {
  APP_VERSION,
  createSettingsHarness,
  GET_PUSH,
  GET_SIGNATURE,
} from './__testing__/createSettingsHarness';

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

const SIGNATURE_FIXTURE = 'signature/users-me-signature__get-success';

describe('SettingsViewModel 설정 탭이 보일 때 (회원)', () => {
  it('TC-SET-002 사인과 푸시 설정을 서로 독립으로 부르고 둘 다 반영한다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    expect(h.callsOf(GET_SIGNATURE)).toBe(1);
    expect(h.callsOf(GET_PUSH)).toBe(1);
    expect(h.viewModel.getSnapshot().push).toMatchObject({
      status: 'ready',
      values: { topic: true, moderation: true, aiReview: true },
    });
    expect(h.signatureCard.getSnapshot().imageUrl).toBe(
      fixtureBody<Record<string, string>>(SIGNATURE_FIXTURE).signatureThumbnailImageUrl,
    );
  });

  it('TC-SET-002 사인 조회가 실패해도 푸시 설정은 정상 표시된다', async () => {
    const h = await createSettingsHarness({
      routes: { [GET_SIGNATURE]: 'signature/users-me-signature__get-internal-error' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push.status).toBe('ready');
    expect(h.signatureCard.getSnapshot().loadError).toBe(true);
  });

  it('TC-SET-002 푸시 설정 조회가 실패해도 사인은 정상 표시된다', async () => {
    const h = await createSettingsHarness({
      routes: { [GET_PUSH]: 'settings/notification-settings__get-internal-error' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push.status).toBe('error');
    expect(h.signatureCard.getSnapshot().imageUrl).not.toBeNull();
  });

  it('TC-SET-002 사인 응답이 늦어도 푸시 설정 조회는 기다리지 않고 먼저 끝난다', async () => {
    const h = await createSettingsHarness();
    const gate = deferred<void>();
    h.router.set(GET_SIGNATURE, async () => {
      await gate.promise;
      return fixtureResponse(SIGNATURE_FIXTURE);
    });
    const shown = h.viewModel.onShown();
    await flush();
    expect(h.viewModel.getSnapshot().push.status).toBe('ready');
    expect(h.signatureCard.getSnapshot().loading).toBe(true);
    gate.resolve();
    await shown;
    expect(h.signatureCard.getSnapshot().loading).toBe(false);
  });

  it('TC-SET-017 REQ-SET-008 조회 중에는 loading이고 값이 없다(스위치 비활성 근거)', async () => {
    const h = await createSettingsHarness();
    const gate = deferred<void>();
    h.router.set(GET_PUSH, async () => {
      await gate.promise;
      return fixtureResponse('settings/notification-settings__get-all-true');
    });
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'loading', values: null });
    const shown = h.viewModel.onShown();
    await flush();
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'loading', values: null });
    gate.resolve();
    await shown;
    expect(h.viewModel.getSnapshot().push.status).toBe('ready');
  });

  it('TC-SET-018 서버 값 그대로 항목별로 반영한다(주제만 꺼진 응답)', async () => {
    const h = await createSettingsHarness({
      routes: { [GET_PUSH]: 'settings/notification-settings__get-topic-off' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push.values).toEqual({
      topic: false,
      moderation: true,
      aiReview: true,
    });
  });

  it('TC-SET-016 REQ-SET-010 푸시 설정 조회가 실패하면 값 없이 error, 토스트 settings.push.load-error다', async () => {
    const h = await createSettingsHarness({
      routes: { [GET_PUSH]: 'settings/notification-settings__get-internal-error' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'error', values: null });
    expect(h.toast.messages).toEqual([t('settings.push.load-error')]);
  });

  it('TC-SET-016 다시 시도하면 재조회해 ready로 돌아간다', async () => {
    const h = await createSettingsHarness({
      routes: { [GET_PUSH]: 'settings/notification-settings__get-internal-error' },
    });
    await h.viewModel.onShown();
    h.router.set(GET_PUSH, 'settings/notification-settings__get-all-true');
    await h.viewModel.retryPush();
    expect(h.viewModel.getSnapshot().push).toMatchObject({
      status: 'ready',
      values: { topic: true, moderation: true, aiReview: true },
    });
    expect(h.callsOf(GET_PUSH)).toBe(2);
  });

  it.each([
    ['필드 누락', 'settings/notification-settings__get-field-missing'],
    ['null 필드', 'settings/notification-settings__get-null-field'],
  ])('TC-SET-015 %s 응답이면 토글을 사용할 수 없는 error 상태다', async (_n, fixture) => {
    const h = await createSettingsHarness({ routes: { [GET_PUSH]: fixture } });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'error', values: null });
  });

  it('TC-SET-010 REQ-SET-010 설정 탭이 다시 보이면 재조회한다', async () => {
    const h = await createSettingsHarness({
      routes: { [GET_PUSH]: 'settings/notification-settings__get-internal-error' },
    });
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    h.router.set(GET_PUSH, 'settings/notification-settings__get-ai-off');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push.values).toEqual({
      topic: true,
      moderation: true,
      aiReview: false,
    });
  });

  it('TC-SET-004 설정 탭이 다시 보일 때마다 사인도 다시 조회한다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    await h.viewModel.onShown();
    expect(h.callsOf(GET_SIGNATURE)).toBe(2);
  });

  it('TC-SET-051 오프라인이면 사인·푸시 설정은 각각 오류 상태이고 계정, 피드백, 약관, 버전은 정상이다', async () => {
    const h = await createSettingsHarness({
      routes: { [GET_PUSH]: networkFailure(), [GET_SIGNATURE]: networkFailure() },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push.status).toBe('error');
    expect(h.signatureCard.getSnapshot().loadError).toBe(true);
    expect(h.viewModel.getSnapshot().version).toBe(APP_VERSION);

    h.viewModel.onFeedbackPress();
    expect(h.navigator.feedbackOpens).toBe(1);
    h.viewModel.onPrivacyPress();
    expect(h.viewModel.getSnapshot().openDocument).toBe('privacy');
    h.viewModel.closeDocument();
    h.viewModel.onLogoutPress();
    expect(h.viewModel.getSnapshot().dialog).toBe('logout');
  });
});

describe('SettingsViewModel 게스트', () => {
  it('TC-SET-008 REQ-SET-002 게스트는 사인·푸시 설정 API를 한 번도 부르지 않는다', async () => {
    const h = await createSettingsHarness({ mode: 'guest' });
    await h.viewModel.onShown();
    expect(h.transport.requests).toHaveLength(0);
    expect(h.viewModel.getSnapshot()).toMatchObject({ mode: 'guest', dialog: 'none' });
  });

  it('TC-FDBK-035 게스트가 피드백 행을 누르면 토스트 nav.guest.feedback만 뜬다', async () => {
    const h = await createSettingsHarness({ mode: 'guest' });
    h.viewModel.onFeedbackPress();
    expect(h.toast.messages).toEqual([t('nav.guest.feedback')]);
    expect(h.navigator.feedbackOpens).toBe(0);
    expect(h.transport.requests).toHaveLength(0);
  });

  it('REQ-SET-002 게스트 "로그인"은 게스트 플래그를 지우고 로그인 화면으로 보낸다', async () => {
    const h = await createSettingsHarness({ mode: 'guest' });
    await h.viewModel.onLoginPress();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
  });

  it('TC-ANL-009 TC-ANL-022 게스트도 회원과 같은 screen_view settings를 보낸다(식별자 없음)', async () => {
    const guest = await createSettingsHarness({ mode: 'guest' });
    await guest.viewModel.onShown();
    const member = await createSettingsHarness();
    await member.viewModel.onShown();
    const expected = [{ name: 'screen_view', params: { screen_name: 'settings' } }];
    expect(guest.analytics.events).toEqual(expected);
    expect(member.analytics.events).toEqual(expected);
  });
});

describe('SettingsViewModel 분석 이벤트', () => {
  it('TC-SET-052 REQ-SET-003 TC-ANL-005 설정 탭이 보일 때 screen_view settings를 1회 보낸다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    expect(h.analytics.events).toEqual([
      { name: 'screen_view', params: { screen_name: 'settings' } },
    ]);
  });

  it('TC-ANL-017 다른 화면에서 돌아와 다시 보일 때마다 screen_view settings를 다시 보낸다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    await h.viewModel.onShown();
    expect(h.analytics.screenNames).toEqual(['settings', 'settings']);
  });

  it('TC-ANL-018 푸시 토글·조회 등 상태가 바뀌어도 screen_view를 다시 보내지 않는다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    await h.viewModel.onPushToggle('topic');
    await h.viewModel.retryPush();
    expect(h.analytics.screenNames).toEqual(['settings']);
  });

  it('TC-ANL-021 분석 전송이 예외를 던져도 설정 로드와 화면 흐름은 영향이 없다', async () => {
    const h = await createSettingsHarness();
    jest.spyOn(h.analytics, 'screenView').mockImplementation(() => {
      throw new Error('analytics down');
    });
    await expect(h.viewModel.onShown()).resolves.toBeUndefined();
    expect(h.viewModel.getSnapshot().push.status).toBe('ready');
  });
});

describe('SettingsViewModel 행 동작', () => {
  it('TC-SET-049 REQ-SET-005 버전정보는 앱 버전 문자열 그대로이고 접두가 없다', async () => {
    const h = await createSettingsHarness();
    expect(h.viewModel.getSnapshot().version).toBe(APP_VERSION);
  });

  it('TC-SET-050 REQ-FDBK-001 회원이 "피드백 보내기"를 누르면 피드백 화면을 연다', async () => {
    const h = await createSettingsHarness();
    h.viewModel.onFeedbackPress();
    expect(h.navigator.feedbackOpens).toBe(1);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SET-004 REQ-SET-004 "변경하기"는 기존 사인 변경 흐름 진입을 부른다', async () => {
    const h = await createSettingsHarness();
    h.signatureCard.onChangePress();
    expect(h.navigator.signatureChangeOpens).toBe(1);
  });

  it('TC-SET-047 TC-ANL-010 개인정보처리방침 행: 문서 ViewModel이 열리고 screen_view privacy_policy를 1회 보낸다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    h.viewModel.onPrivacyPress();
    await flush();
    expect(h.viewModel.getSnapshot().openDocument).toBe('privacy');
    expect(h.viewModel.document?.kind).toBe('privacy');
    expect(h.viewModel.document?.getSnapshot().inAppUrl).toBe(TERMS_URLS.privacy);
    expect(h.analytics.screenNames).toEqual(['settings', 'privacy_policy']);
  });

  it('TC-SET-047 TC-ANL-010 이용약관 행: screen_view terms_of_service를 1회 보낸다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    h.viewModel.onTermsPress();
    await flush();
    expect(h.viewModel.getSnapshot().openDocument).toBe('service');
    expect(h.viewModel.document?.getSnapshot().inAppUrl).toBe(TERMS_URLS.service);
    expect(h.analytics.screenNames).toEqual(['settings', 'terms_of_service']);
  });

  it('TC-ANL-011 문서를 닫아도 이전 화면 이벤트를 다시 보내지 않고 문서 ViewModel을 버린다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    h.viewModel.onTermsPress();
    await flush();
    h.viewModel.closeDocument();
    expect(h.viewModel.getSnapshot().openDocument).toBeNull();
    expect(h.viewModel.document).toBeNull();
    expect(h.analytics.screenNames).toEqual(['settings', 'terms_of_service']);
  });

  it('TC-SET-047 문서가 열려 있는 동안 같은 행을 다시 눌러도 문서는 하나다', async () => {
    const h = await createSettingsHarness();
    h.viewModel.onTermsPress();
    const first = h.viewModel.document;
    h.viewModel.onTermsPress();
    h.viewModel.onPrivacyPress();
    expect(h.viewModel.document).toBe(first);
    await flush();
    expect(h.analytics.screenNames).toEqual(['terms_of_service']);
  });

  it('REQ-SET-006 허용 호스트 밖 문서 URL이라면 시스템 브라우저로 열고 시트를 닫는다(링크 열기 포트 사용)', async () => {
    const h = await createSettingsHarness();
    h.linkOpener.result = 'opened';
    // 문서 ViewModel이 쓰는 링크 열기는 주입된 ExternalLinkOpener여야 한다.
    h.viewModel.onTermsPress();
    await flush();
    await h.viewModel.document?.openExternal('https://example.com/outside');
    expect(h.linkOpener.opened).toEqual(['https://example.com/outside']);
  });

  it('TC-SET-048 문서 로딩이 실패하면 error 상태이고 다시 시도하면 loading으로 돌아간다', async () => {
    const h = await createSettingsHarness();
    h.viewModel.onPrivacyPress();
    await flush();
    h.viewModel.document?.onWebViewFailed();
    expect(h.viewModel.document?.getSnapshot().status).toBe('error');
    h.viewModel.document?.retry();
    expect(h.viewModel.document?.getSnapshot()).toMatchObject({
      status: 'loading',
      loadAttempt: 1,
    });
  });
});

describe('SettingsViewModel 계정 전환과 정리', () => {
  it('TC-SET-037 REQ-SET-020 clearAll 뒤에는 이전 계정의 푸시 값과 사인이 남지 않는다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    await h.viewModel.clearAll();
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'loading', values: null });
    expect(h.signatureCard.getSnapshot().imageUrl).toBeNull();
  });

  it('TC-SET-032 clearAll 이후 이전 계정의 조회 응답이 늦게 도착해도 반영하지 않는다', async () => {
    const h = await createSettingsHarness();
    const gate = deferred<void>();
    h.router.set(GET_PUSH, async () => {
      await gate.promise;
      return fixtureResponse('settings/notification-settings__get-all-true');
    });
    const shown = h.viewModel.onShown();
    await flush();
    await h.viewModel.clearAll();
    gate.resolve();
    await shown;
    await flush();
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'loading', values: null });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SET-037 계정 전환 뒤 다시 보이면 새로 조회하고 새 계정 값을 보인다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    await h.viewModel.clearAll();
    h.router.set(GET_PUSH, 'settings/notification-settings__get-topic-off');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push.values).toEqual({
      topic: false,
      moderation: true,
      aiReview: true,
    });
  });

  it('dispose는 구독을 정리하고 하위 ViewModel(AccountActions, 사인 카드)도 버린다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onShown();
    expect(h.visibility.listenerCount).toBe(1);
    h.viewModel.dispose();
    expect(h.visibility.listenerCount).toBe(0);
    // 버려진 AccountActions는 실패를 토스트하지 않는다(화면 이탈 규칙).
    h.router.set('DELETE /users/me', 'auth/users-me__delete-internal-error');
    await h.account.confirmWithdraw();
    expect(h.toast.messages).toEqual([]);
  });
});
