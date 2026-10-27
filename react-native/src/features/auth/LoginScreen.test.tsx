import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SocialLoginError } from '../../core/auth/SocialLoginClient';
import { deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import { LoginScreen } from './LoginScreen';
import { createLoginHarness } from './__testing__/createLoginHarness';

describe('LoginScreen', () => {
  it('TC-AUTH-001 태그라인, 카카오 버튼, 게스트 버튼이 보이고 Apple·Google 버튼은 없다', async () => {
    const h = createLoginHarness();
    await render(<LoginScreen viewModel={h.viewModel} />);

    expect(screen.getByTestId('login.root')).toBeOnTheScreen();
    expect(screen.getByTestId('login.tagline')).toHaveTextContent(t('auth.login.tagline'));
    expect(screen.getByTestId('login.kakao-button')).toHaveTextContent(t('auth.login.kakao'));
    expect(screen.getByTestId('login.guest-button')).toHaveTextContent(t('auth.login.guest'));
    expect(screen.queryByText(/Apple|Google|애플|구글/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('login.loading')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('login.error-dialog')).not.toBeOnTheScreen();
  });

  it('REQ-BOOT-021 StrictMode(mount/unmount/mount)에서도 화면은 screen_view를 보내지 않고 버튼이 동작한다(수명주기는 소유자 몫)', async () => {
    const h = createLoginHarness();
    h.viewModel.onScreenShown(); // 소유자(LoginViewModelOwner)가 phase 진입 때 1회 부른다.
    h.routes({ 'POST /auth/social-login': 'auth/social-login__login-success' });
    await render(
      <StrictMode>
        <LoginScreen viewModel={h.viewModel} />
      </StrictMode>,
    );
    expect(h.analytics.screenNames).toEqual(['login']);

    await fireEvent.press(screen.getByTestId('login.kakao-button'));
    expect(await screen.findByTestId('login.kakao-button')).toBeEnabled();
    expect(h.navigator.calls).toEqual(['main:member']);
    expect(h.analytics.screenNames).toEqual(['login']);
  });

  it('TC-AUTH-027 카카오 버튼을 3회 눌러도 SDK·서버 요청은 1회이고 진행 중에는 버튼이 비활성이며 로딩이 보인다', async () => {
    const h = createLoginHarness();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/social-login__login-success');
    });
    await render(<LoginScreen viewModel={h.viewModel} />);

    await fireEvent.press(screen.getByTestId('login.kakao-button'));
    await fireEvent.press(screen.getByTestId('login.kakao-button'));
    await fireEvent.press(screen.getByTestId('login.kakao-button'));

    expect(await screen.findByTestId('login.loading')).toBeOnTheScreen();
    expect(screen.getByTestId('login.kakao-button')).toBeDisabled();
    expect(screen.getByTestId('login.guest-button')).toBeDisabled();
    expect(h.client.nonceHashes).toHaveLength(1);

    gate.resolve();
    expect(await screen.findByTestId('login.kakao-button')).toBeEnabled();
    expect(h.transport.requestsTo('POST', '/auth/social-login')).toHaveLength(1);
    expect(h.navigator.calls).toEqual(['main:member']);
  });

  it('TC-AUTH-013 취소하면 오류 알림 없이 버튼이 다시 활성화된다', async () => {
    const h = createLoginHarness();
    h.client.outcome = { kind: 'cancelled' };
    await render(<LoginScreen viewModel={h.viewModel} />);
    await fireEvent.press(screen.getByTestId('login.kakao-button'));
    expect(await screen.findByTestId('login.kakao-button')).toBeEnabled();
    expect(screen.queryByTestId('login.error-dialog')).not.toBeOnTheScreen();
  });

  it('TC-AUTH-018 SDK 설정 오류는 오류 알림에 문구를 보이고, 확인하면 닫히며 버튼은 활성이다', async () => {
    const h = createLoginHarness();
    h.client.outcome = new SocialLoginError('config');
    await render(<LoginScreen viewModel={h.viewModel} />);
    await fireEvent.press(screen.getByTestId('login.kakao-button'));

    expect(await screen.findByTestId('login.error-dialog')).toBeOnTheScreen();
    expect(screen.getByText(t('auth.login.error.config'))).toBeOnTheScreen();
    expect(screen.getByTestId('login.kakao-button')).toBeEnabled();

    await fireEvent.press(screen.getByTestId('login.error-dialog-confirm-button'));
    expect(screen.queryByTestId('login.error-dialog')).not.toBeOnTheScreen();
  });

  it('TC-AUTH-029 같은 오류가 연달아 나도 확인 후 다시 시도하면 알림이 다시 표시된다', async () => {
    const h = createLoginHarness();
    h.transport.script(fixtureResponse('auth/social-login__internal-error'));
    await render(<LoginScreen viewModel={h.viewModel} />);

    await fireEvent.press(screen.getByTestId('login.kakao-button'));
    expect(await screen.findByText(t('auth.login.error.generic'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('login.error-dialog-confirm-button'));
    expect(screen.queryByTestId('login.error-dialog')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('login.kakao-button'));
    expect(await screen.findByText(t('auth.login.error.generic'))).toBeOnTheScreen();
  });

  it('TC-AUTH-021 403이면 서버 message가 알림에 보인다', async () => {
    const h = createLoginHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__forbidden-banned' });
    await render(<LoginScreen viewModel={h.viewModel} />);
    await fireEvent.press(screen.getByTestId('login.kakao-button'));
    expect(await screen.findByText('차단된 소셜 계정입니다.')).toBeOnTheScreen();
  });

  it('TC-AUTH-032 게스트 버튼을 누르면 서버 호출 없이 메인(게스트)으로 이동 요청한다', async () => {
    const h = createLoginHarness();
    await render(<LoginScreen viewModel={h.viewModel} />);
    await fireEvent.press(screen.getByTestId('login.guest-button'));
    await screen.findByTestId('login.guest-button');
    expect(h.navigator.calls).toEqual(['main:guest']);
    expect(h.transport.requests).toHaveLength(0);
  });

  it('화면이 언마운트돼도 ViewModel을 dispose하지 않는다(소유자가 phase 이탈 때 dispose)', async () => {
    const h = createLoginHarness();
    const { unmount } = await render(<LoginScreen viewModel={h.viewModel} />);
    await unmount();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__login-success' });
    await h.viewModel.onKakaoPress();
    expect(h.navigator.calls).toEqual(['main:member']);
  });
});
