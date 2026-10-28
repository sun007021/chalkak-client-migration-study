import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { View } from 'react-native';

import { deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import type { WebViewComponentProps } from '../onboarding/LegalDocSheet';
import {
  APP_VERSION,
  createSettingsHarness,
  GET_PUSH,
  PATCH_PUSH,
  type SettingsHarness,
  type SettingsHarnessOptions,
} from './__testing__/createSettingsHarness';
import { SettingsScreen } from './SettingsScreen';

function createFakeWebView() {
  const mounts: WebViewComponentProps[] = [];
  function FakeWebView(props: WebViewComponentProps) {
    useEffect(() => {
      mounts.push(props);
    }, [props]);
    return <View testID="fake-webview" />;
  }
  return { FakeWebView, mounts };
}

async function renderSettings(options: SettingsHarnessOptions = {}) {
  const h = await createSettingsHarness(options);
  const web = createFakeWebView();
  const view = await render(<SettingsScreen viewModel={h.viewModel} WebView={web.FakeWebView} />);
  return { h, web, view };
}

const toggle = (name: 'topic' | 'moderation' | 'ai') =>
  screen.getByTestId(`settings.push-${name}-toggle`);
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
};

describe('SettingsScreen 회원', () => {
  it('TC-SET-001 앱 설정(사인 카드), 푸시 토글 3개, 계정, 피드백, 정보 및 약관 행이 보인다', async () => {
    await renderSettings();
    await flush();
    expect(screen.getByTestId('settings.root')).toBeOnTheScreen();
    for (const id of [
      'settings.signature-card',
      'settings.signature-change-button',
      'settings.push-section',
      'settings.push-topic-toggle',
      'settings.push-moderation-toggle',
      'settings.push-ai-toggle',
      'settings.logout-row',
      'settings.withdraw-row',
      'settings.feedback-row',
      'settings.privacy-row',
      'settings.terms-row',
      'settings.version-row',
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    expect(screen.queryByTestId('settings.login-button')).not.toBeOnTheScreen();
  });

  it('REQ-SET-001 섹션 제목이 앱 설정, 푸시 알림, 계정, 피드백, 정보 및 약관 순서로 보인다', async () => {
    await renderSettings();
    await flush();
    const text = JSON.stringify(screen.toJSON());
    const order = [
      'settings.signature-card',
      'settings.push-section',
      'settings.logout-row',
      'settings.feedback-row',
      'settings.privacy-row',
    ].map((id) => text.indexOf(`"testID":"${id}"`));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('TC-SET-018 REQ-SET-009 토글 라벨과 checked 상태가 서버 값과 같다', async () => {
    await renderSettings({ routes: { [GET_PUSH]: 'settings/notification-settings__get-ai-off' } });
    await flush();
    expect(screen.getByText(t('settings.push.topic'))).toBeOnTheScreen();
    expect(screen.getByText(t('settings.push.moderation'))).toBeOnTheScreen();
    expect(screen.getByText(t('settings.push.ai-review'))).toBeOnTheScreen();
    expect(toggle('topic')).toBeChecked();
    expect(toggle('moderation')).toBeChecked();
    expect(toggle('ai')).not.toBeChecked();
  });

  it('TC-SET-039 OS 권한 상태 행은 없고 서버 토글 3개만 있다', async () => {
    await renderSettings({ permission: 'denied' });
    await flush();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(screen.queryByTestId('settings.permission-row')).not.toBeOnTheScreen();
  });

  it('TC-SET-017 REQ-SET-008 설정 로드 중에는 토글이 비활성이고 로딩 표시가 있다', async () => {
    const h = await createSettingsHarness();
    const gate = deferred<void>();
    h.router.set(GET_PUSH, async () => {
      await gate.promise;
      return fixtureResponse('settings/notification-settings__get-all-true');
    });
    await render(
      <SettingsScreen viewModel={h.viewModel} WebView={createFakeWebView().FakeWebView} />,
    );
    await flush();
    expect(screen.getByTestId('settings.push-loading')).toBeOnTheScreen();
    expect(toggle('topic')).toBeDisabled();
    expect(toggle('moderation')).toBeDisabled();
    expect(toggle('ai')).toBeDisabled();
    gate.resolve();
    await flush();
    expect(screen.queryByTestId('settings.push-loading')).not.toBeOnTheScreen();
    expect(toggle('topic')).toBeEnabled();
  });

  it('TC-SET-016 설정 로드 실패 시 토글이 비활성이고 오류 문구와 다시 시도가 보이며 다시 시도하면 재조회한다', async () => {
    const { h } = await renderSettings({
      routes: { [GET_PUSH]: 'settings/notification-settings__get-internal-error' },
    });
    await flush();
    expect(screen.getByTestId('settings.push-error')).toHaveTextContent(
      t('settings.push.load-error'),
    );
    expect(toggle('topic')).toBeDisabled();
    h.router.set(GET_PUSH, 'settings/notification-settings__get-all-true');
    await fireEvent.press(screen.getByTestId('settings.push-retry-button'));
    await flush();
    expect(screen.queryByTestId('settings.push-error')).not.toBeOnTheScreen();
    expect(toggle('topic')).toBeEnabled();
    // router.set이 호출 기록을 새로 시작하므로 다시 시도 이후의 요청만 센다.
    expect(h.callsOf(GET_PUSH)).toBe(1);
  });

  it('TC-SET-023 토글을 누르면 응답 전에 즉시 바뀌어 보이고 PATCH는 해당 항목만 나간다', async () => {
    const { h } = await renderSettings();
    await flush();
    const gate = deferred<void>();
    h.router.set(PATCH_PUSH, async () => {
      await gate.promise;
      return fixtureResponse('settings/notification-settings__patch-no-content');
    });
    await fireEvent(toggle('moderation'), 'valueChange', false);
    await flush();
    expect(toggle('moderation')).not.toBeChecked();
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(1);
    gate.resolve();
    await flush();
    expect(toggle('moderation')).not.toBeChecked();
    expect(h.patchBodies()).toEqual([{ moderationPushEnabled: false }]);
  });

  it('TC-SET-024 저장이 실패하면 토글만 이전 값으로 돌아온다', async () => {
    const { h } = await renderSettings();
    await flush();
    h.router.set(PATCH_PUSH, 'settings/notification-settings__patch-internal-error');
    await fireEvent(toggle('topic'), 'valueChange', false);
    await flush();
    expect(toggle('topic')).toBeChecked();
    expect(toggle('moderation')).toBeChecked();
  });

  it('TC-SET-049 REQ-SET-005 버전정보 행에 앱 버전 문자열이 보이고 탭해도 아무 동작이 없다', async () => {
    const { h } = await renderSettings();
    await flush();
    expect(screen.getByTestId('settings.version-value')).toHaveTextContent(APP_VERSION);
    const before = h.transport.requests.length;
    await fireEvent.press(screen.getByTestId('settings.version-row'));
    expect(h.transport.requests).toHaveLength(before);
    expect(h.navigator.feedbackOpens).toBe(0);
  });

  it('TC-SET-050 "피드백 보내기" 행을 누르면 피드백 화면 진입을 요청한다', async () => {
    const { h } = await renderSettings();
    await flush();
    await fireEvent.press(screen.getByTestId('settings.feedback-row'));
    expect(h.navigator.feedbackOpens).toBe(1);
  });

  it('REQ-SET-004 사인 카드 "변경하기"는 기존 사인 변경 흐름 진입을 요청한다', async () => {
    const { h } = await renderSettings();
    await flush();
    await fireEvent.press(screen.getByTestId('settings.signature-change-button'));
    expect(h.navigator.signatureChangeOpens).toBe(1);
  });

  it('TC-SET-047 TC-SET-048 약관 행을 누르면 문서 시트가 열리고 로딩 실패 시 오류 상태와 다시 시도가 보인다', async () => {
    const { h, web } = await renderSettings();
    await flush();
    await fireEvent.press(screen.getByTestId('settings.terms-row'));
    await flush();
    expect(screen.getByTestId('legal-doc.sheet')).toBeOnTheScreen();
    expect(h.analytics.screenNames).toContain('terms_of_service');
    await act(async () => web.mounts.at(-1)!.onError());
    expect(screen.getByTestId('legal-doc.error-state')).toBeOnTheScreen();
    expect(screen.getByTestId('legal-doc.retry-button')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('legal-doc.close-button'));
    expect(screen.queryByTestId('legal-doc.sheet')).not.toBeOnTheScreen();
  });

  it('TC-ANL-018 REQ-SET-003 화면이 다시 그려져도 screen_view settings는 마운트당 1회뿐이고 언마운트가 onHidden이다', async () => {
    const { h, view } = await renderSettings();
    await flush();
    await view.rerender(
      <SettingsScreen viewModel={h.viewModel} WebView={createFakeWebView().FakeWebView} />,
    );
    await flush();
    expect(h.analytics.screenNames).toEqual(['settings']);
    expect(h.visibility.listenerCount).toBe(1);
    await view.unmount();
    expect(h.visibility.listenerCount).toBe(0);
  });
});

describe('SettingsScreen 확인 대화상자', () => {
  async function open(id: 'logout' | 'withdraw'): Promise<SettingsHarness> {
    const { h } = await renderSettings();
    await flush();
    await fireEvent.press(screen.getByTestId(`settings.${id}-row`));
    return h;
  }

  it('TC-SET-041 로그아웃 다이얼로그에 문구, 확인/취소가 있고 취소하면 닫힌다', async () => {
    const h = await open('logout');
    expect(screen.getByTestId('settings.logout-dialog')).toHaveTextContent(
      t('auth.logout.confirm.message'),
    );
    expect(screen.getByTestId('settings.logout-confirm-button')).toHaveTextContent(
      t('auth.logout.confirm.ok'),
    );
    await fireEvent.press(screen.getByTestId('settings.logout-cancel-button'));
    expect(screen.queryByTestId('settings.logout-dialog')).not.toBeOnTheScreen();
    expect(h.router.calls('POST /auth/logout')).toHaveLength(0);
  });

  it('TC-SET-044 TC-SET-041 회원탈퇴 다이얼로그는 별도 문구를 쓰고 로그아웃 다이얼로그와 구분된다', async () => {
    await open('withdraw');
    expect(screen.getByTestId('settings.withdraw-dialog')).toHaveTextContent(
      t('auth.withdraw.confirm.message'),
    );
    expect(screen.getByTestId('settings.withdraw-confirm-button')).toHaveTextContent(
      t('auth.withdraw.confirm.ok'),
    );
    expect(screen.queryByTestId('settings.logout-dialog')).not.toBeOnTheScreen();
  });

  it('TC-SET-045 TC-AUTH-040 탈퇴 처리 중에는 확인 버튼이 비활성이다', async () => {
    const h = await open('withdraw');
    const gate = deferred<void>();
    h.router.set('DELETE /users/me', async () => {
      await gate.promise;
      return fixtureResponse('auth/users-me__delete-no-content');
    });
    await fireEvent.press(screen.getByTestId('settings.withdraw-confirm-button'));
    await flush();
    expect(screen.getByTestId('settings.withdraw-confirm-button')).toBeDisabled();
    gate.resolve();
    await flush();
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('TC-SET-046 탈퇴가 실패하면 다이얼로그가 닫히고 설정 화면이 유지된다', async () => {
    const h = await open('withdraw');
    h.router.set('DELETE /users/me', 'auth/users-me__delete-internal-error');
    await fireEvent.press(screen.getByTestId('settings.withdraw-confirm-button'));
    await flush();
    expect(screen.queryByTestId('settings.withdraw-dialog')).not.toBeOnTheScreen();
    expect(screen.getByTestId('settings.root')).toBeOnTheScreen();
    expect(h.toast.messages).toEqual([t('auth.withdraw.error')]);
  });
});

describe('SettingsScreen 게스트', () => {
  it('TC-SET-008 REQ-SET-002 "로그인" 버튼 하나뿐이고 다른 행은 없으며 API 호출이 0건이다', async () => {
    const { h } = await renderSettings({ mode: 'guest' });
    await flush();
    expect(screen.getByTestId('settings.login-button')).toHaveTextContent(
      t('settings.guest.login'),
    );
    for (const id of [
      'settings.signature-card',
      'settings.push-section',
      'settings.logout-row',
      'settings.withdraw-row',
      'settings.feedback-row',
      'settings.privacy-row',
      'settings.terms-row',
      'settings.version-row',
    ]) {
      expect(screen.queryByTestId(id)).not.toBeOnTheScreen();
    }
    expect(h.transport.requests).toHaveLength(0);
    expect(h.analytics.screenNames).toEqual(['settings']);
  });

  it('REQ-SET-002 "로그인"을 누르면 로그인 화면으로 보낸다', async () => {
    const { h } = await renderSettings({ mode: 'guest' });
    await flush();
    await fireEvent.press(screen.getByTestId('settings.login-button'));
    await flush();
    expect(h.authFlow.calls).toEqual(['login']);
  });
});
