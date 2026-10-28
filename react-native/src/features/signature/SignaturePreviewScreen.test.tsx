import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { deferred } from '../../core/http/__testing__/FakeTransport';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { t } from '../../shared/copy';
import { FakeAuthFlowNavigator } from '../auth/__testing__/FakeAuthFlowNavigator';
import { SIGNATURE_PREVIEW_BACKDROP_COLOR, SignaturePreviewScreen } from './SignaturePreviewScreen';
import { SignaturePreviewViewModel } from './SignaturePreviewViewModel';
import type { SignatureMode } from './mapSignatureError';
import { FakeSignatureSubmitter } from './__testing__/FakeSignatureSubmitter';

function setup(mode: SignatureMode, submitter = new FakeSignatureSubmitter()) {
  const host = { onRedraw: jest.fn(), onRejected: jest.fn(), onCompleted: jest.fn() };
  const vm = new SignaturePreviewViewModel({
    mode,
    png: new Uint8Array([1, 2, 3]),
    submitter,
    host,
    authNavigator: new FakeAuthFlowNavigator(),
    toast: new FakeToastPresenter(),
  });
  return { vm, host, submitter };
}

/** WCAG 상대 휘도(0~1). */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

describe('SignaturePreviewScreen', () => {
  it('TC-ONB-048 가입 모드: 제목·미리보기·"다시 그리기"·"시작하기"가 보이고 변경 안내는 없다', async () => {
    const { vm } = setup('onboarding');
    await render(<SignaturePreviewScreen viewModel={vm} />);
    expect(screen.getByTestId('signature-preview.root')).toBeOnTheScreen();
    expect(screen.getByTestId('signature-preview.title')).toHaveTextContent(
      t('onb.sign.preview.title'),
    );
    expect(screen.getByTestId('signature-preview.image')).toBeOnTheScreen();
    expect(screen.getByTestId('signature-preview.redraw-button')).toHaveTextContent(
      t('onb.sign.preview.redraw'),
    );
    expect(screen.getByTestId('signature-preview.confirm-button')).toHaveTextContent(
      t('onb.sign.preview.start'),
    );
    expect(screen.queryByTestId('signature-preview.change-notice')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('signature-preview.loading')).not.toBeOnTheScreen();
  });

  it('TC-SIGN-017 변경 모드: "사인 변경하기" 버튼과 변경 안내가 보인다', async () => {
    const { vm } = setup('change');
    await render(<SignaturePreviewScreen viewModel={vm} />);
    expect(screen.getByTestId('signature-preview.confirm-button')).toHaveTextContent(
      t('sign.change.confirm'),
    );
    expect(screen.getByTestId('signature-preview.change-notice')).toHaveTextContent(
      t('sign.change.notice'),
    );
    expect(screen.getByTestId('signature-preview.root')).toHaveAccessibilityValue({
      text: 'change',
    });
  });

  it('REQ-SIGN-010 미리보기는 흰 획이 보이도록 어두운 배경 위에 그려진다', async () => {
    expect(luminance(SIGNATURE_PREVIEW_BACKDROP_COLOR)).toBeLessThan(0.3);
    const { vm } = setup('onboarding');
    await render(<SignaturePreviewScreen viewModel={vm} />);
    expect(screen.getByTestId('signature-preview.image')).toHaveStyle({
      backgroundColor: SIGNATURE_PREVIEW_BACKDROP_COLOR,
    });
  });

  it('TC-SIGN-018 "다시 그리기"가 host.onRedraw를 부르고 서버 호출은 없다', async () => {
    const { vm, host, submitter } = setup('onboarding');
    await render(<SignaturePreviewScreen viewModel={vm} />);
    await fireEvent.press(screen.getByTestId('signature-preview.redraw-button'));
    expect(host.onRedraw).toHaveBeenCalledTimes(1);
    expect(submitter.calls).toHaveLength(0);
  });

  it('TC-ONB-043 진행 중에는 확인 버튼이 비활성이고 진행 표시가 보이며 연타해도 요청은 한 번이다', async () => {
    const gate = deferred<void>();
    const { vm, submitter } = setup(
      'onboarding',
      new FakeSignatureSubmitter().holdUntil(gate.promise),
    );
    await render(
      <StrictMode>
        <SignaturePreviewScreen viewModel={vm} />
      </StrictMode>,
    );
    const confirm = () => screen.getByTestId('signature-preview.confirm-button');
    await fireEvent.press(confirm());
    await fireEvent.press(confirm());
    await fireEvent.press(confirm());
    expect(await screen.findByTestId('signature-preview.loading')).toBeOnTheScreen();
    expect(confirm()).toBeDisabled();
    expect(submitter.calls).toHaveLength(1);
    gate.resolve();
  });

  it('REQ-ONB-020 실패하면 오류 알림이 보이고 확인으로 닫으면 다시 시작할 수 있다', async () => {
    const { vm } = setup(
      'onboarding',
      new FakeSignatureSubmitter().script(new Error('boom'), 'ok'),
    );
    await render(<SignaturePreviewScreen viewModel={vm} />);
    await fireEvent.press(screen.getByTestId('signature-preview.confirm-button'));
    expect(await screen.findByTestId('signature-preview.error-dialog')).toBeOnTheScreen();
    expect(screen.getByTestId('signature-preview.error-message')).toHaveTextContent(
      t('onb.signup.error.generic'),
    );
    await fireEvent.press(screen.getByTestId('signature-preview.error-dialog-confirm-button'));
    expect(screen.queryByTestId('signature-preview.error-dialog')).not.toBeOnTheScreen();
    expect(screen.getByTestId('signature-preview.confirm-button')).toBeEnabled();
  });
});
