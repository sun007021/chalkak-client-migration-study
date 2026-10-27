import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { createBootHarness } from '../features/boot/__testing__/createBootHarness';
import { FakeStoreOpener } from '../features/boot/__testing__/fakes';
import { UpdateDialogViewModel } from '../features/boot/UpdateDialogViewModel';
import { t } from '../shared/copy';
import { BootHost } from './BootHost';

function setup(results: Parameters<typeof createBootHarness>[0] = {}) {
  const h = createBootHarness(results);
  const opener = new FakeStoreOpener();
  const dialogVm = new UpdateDialogViewModel(opener);
  const ui = (
    <BootHost
      viewModel={h.viewModel}
      updateDialogViewModel={dialogVm}
      login={<View testID="test.login" />}
      main={<View testID="test.main" />}
    />
  );
  return { h, opener, ui };
}

describe('BootHost', () => {
  it('TC-BOOT-001 TC-BOOT-015 시작 직후와 게이트 확인 중에는 스플래시만 보이고 로그인·홈은 그려지지 않는다', async () => {
    const { ui } = setup();
    await render(ui);
    expect(screen.getByTestId('splash.logo')).toBeOnTheScreen();
    expect(screen.queryByTestId('test.login')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('test.main')).not.toBeOnTheScreen();
  });

  it('TC-BOOT-001 세션이 없으면 스플래시 뒤 로그인이 열리고 홈은 한 번도 그려지지 않는다', async () => {
    const { h, ui } = setup();
    await render(ui);
    await h.viewModel.start();
    expect(await screen.findByTestId('test.login')).toBeOnTheScreen();
    expect(screen.queryByTestId('splash.logo')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('test.main')).not.toBeOnTheScreen();
  });

  it('TC-BOOT-002 인증 세션이면 로그인 없이 홈이 열린다', async () => {
    const { h, ui } = setup();
    await h.signIn();
    await render(ui);
    await h.viewModel.start();
    expect(await screen.findByTestId('test.main')).toBeOnTheScreen();
    expect(screen.queryByTestId('test.login')).not.toBeOnTheScreen();
  });

  it('TC-BOOT-016 TC-BOOT-028 강제 업데이트면 다이얼로그만 보이고 뒤 화면은 마운트되지 않는다', async () => {
    const { h, ui } = setup({ results: ['update-required'] });
    await h.signIn();
    await render(ui);
    await h.viewModel.start();

    expect(await screen.findByTestId('update-gate.dialog')).toBeOnTheScreen();
    expect(screen.getByTestId('update-gate.title')).toHaveTextContent(t('boot.update.title'));
    expect(screen.getByTestId('update-gate.message')).toHaveTextContent(t('boot.update.body'));
    expect(screen.getByTestId('update-gate.update-button')).toHaveTextContent(
      t('boot.update.button'),
    );
    expect(screen.queryByTestId('test.main')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('test.login')).not.toBeOnTheScreen();
  });

  it('TC-BOOT-028 닫기 요청(뒤로가기·바깥 탭 대응 requestClose)을 해도 다이얼로그는 남는다', async () => {
    const { h, ui } = setup({ results: ['update-required'] });
    await render(ui);
    await h.viewModel.start();
    const dialog = await screen.findByTestId('update-gate.dialog');
    await fireEvent(dialog, 'requestClose');
    expect(screen.getByTestId('update-gate.dialog')).toBeOnTheScreen();
  });

  it('TC-BOOT-029 "업데이트" 연타는 스토어 열기를 1회만 호출한다', async () => {
    const { h, ui, opener } = setup({ results: ['update-required'] });
    opener.gate = new Promise(() => undefined);
    await render(ui);
    await h.viewModel.start();
    const button = await screen.findByTestId('update-gate.update-button');
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(opener.calls).toBe(1);
  });

  it('TC-AUTH-056 세션 만료 이벤트를 받으면 홈이 사라지고 로그인만 남는다(뒤로 갈 이전 화면 없음)', async () => {
    const { h, ui } = setup();
    await h.signIn();
    await render(ui);
    await h.viewModel.start();
    expect(await screen.findByTestId('test.main')).toBeOnTheScreen();

    h.events.emit({ type: 'session-expired' });

    expect(await screen.findByTestId('test.login')).toBeOnTheScreen();
    expect(screen.queryByTestId('test.main')).not.toBeOnTheScreen();
  });
});
