import { fireEvent, render, screen } from '@testing-library/react-native';

import { t } from '../../shared/copy';
import { SignatureDrawScreen } from './SignatureDrawScreen';
import { SignatureDrawViewModel } from './SignatureDrawViewModel';
import { SignatureEncoder } from './SignatureEncoder';
import { CANVAS, drawDot } from './__testing__/draw';
import { FakeSignatureRasterizer } from './__testing__/FakeSignatureRasterizer';

function setup(mode: 'onboarding' | 'change' = 'onboarding') {
  const rasterizer = new FakeSignatureRasterizer();
  const onBack = jest.fn();
  const vm = new SignatureDrawViewModel({
    canvas: CANVAS,
    encoder: new SignatureEncoder(rasterizer),
    onConfirmed: jest.fn(),
  });
  return { vm, onBack, rasterizer, mode };
}

describe('SignatureDrawScreen', () => {
  it('TC-SIGN-001 제목·안내·캔버스·힌트와 세 버튼이 보이고 획이 없으면 모두 비활성이다', async () => {
    const { vm, onBack } = setup();
    await render(<SignatureDrawScreen viewModel={vm} mode="onboarding" onBack={onBack} />);

    expect(screen.getByTestId('signature.root')).toBeOnTheScreen();
    expect(screen.getByTestId('signature.title')).toHaveTextContent('작가님의');
    expect(screen.getByTestId('signature.guide-text')).toHaveTextContent(
      '모든 사진에 함께할 사인이에요.',
    );
    expect(screen.getByTestId('signature.canvas')).toBeOnTheScreen();
    expect(screen.getByTestId('signature.canvas-hint')).toHaveTextContent(t('onb.sign.pad-hint'));
    expect(screen.getByTestId('signature.undo-button')).toHaveTextContent(t('onb.sign.undo'));
    expect(screen.getByTestId('signature.clear-button')).toHaveTextContent(t('onb.sign.clear'));
    expect(screen.getByTestId('signature.submit-button')).toHaveTextContent(t('onb.sign.confirm'));
    expect(screen.getByTestId('signature.undo-button')).toBeDisabled();
    expect(screen.getByTestId('signature.clear-button')).toBeDisabled();
    expect(screen.getByTestId('signature.submit-button')).toBeDisabled();
    expect(screen.queryByTestId('signature.error-message')).not.toBeOnTheScreen();
  });

  it('TC-SIGN-002 획이 생기면 힌트가 사라지고 버튼이 활성이 된다', async () => {
    const { vm, onBack } = setup();
    await render(<SignatureDrawScreen viewModel={vm} mode="onboarding" onBack={onBack} />);
    drawDot(vm);
    expect(await screen.findByTestId('signature.submit-button')).toBeEnabled();
    expect(screen.getByTestId('signature.undo-button')).toBeEnabled();
    expect(screen.getByTestId('signature.clear-button')).toBeEnabled();
    expect(screen.queryByTestId('signature.canvas-hint')).not.toBeOnTheScreen();
  });

  it('TC-SIGN-006 TC-SIGN-007 되돌리기·전체 지우기 버튼이 ViewModel로 연결된다', async () => {
    const { vm, onBack } = setup();
    drawDot(vm, 10, 10);
    drawDot(vm, 20, 20);
    await render(<SignatureDrawScreen viewModel={vm} mode="onboarding" onBack={onBack} />);
    await fireEvent.press(screen.getByTestId('signature.undo-button'));
    expect(vm.getSnapshot().strokes).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('signature.clear-button'));
    expect(vm.getSnapshot().strokes).toHaveLength(0);
  });

  it('TC-SIGN-015 1 MiB 초과 오류가 signature.error-message에 보인다', async () => {
    const { vm, onBack, rasterizer } = setup();
    rasterizer.setSize(2_000_000);
    drawDot(vm);
    await render(<SignatureDrawScreen viewModel={vm} mode="onboarding" onBack={onBack} />);
    await fireEvent.press(screen.getByTestId('signature.submit-button'));
    expect(await screen.findByTestId('signature.error-message')).toHaveTextContent(
      t('sign.error.too-large'),
    );
  });

  it('REQ-SIGN-012 mode(onboarding/change)를 accessibilityValue로 노출하고 뒤로 버튼이 onBack을 부른다', async () => {
    const { vm, onBack } = setup();
    await render(<SignatureDrawScreen viewModel={vm} mode="change" onBack={onBack} />);
    expect(screen.getByTestId('signature.root')).toHaveAccessibilityValue({ text: 'change' });
    await fireEvent.press(screen.getByTestId('signature.back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
