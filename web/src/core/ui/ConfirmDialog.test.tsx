import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

function setup(o: { busy?: boolean; destructive?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<ConfirmDialog testIdPrefix="settings.logout" message="정말요?" confirmLabel="확인함" busy={o.busy} destructive={o.destructive} onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('하단 바(zIndex 100) 위에 보이도록 오버레이 zIndex가 200이다', () => {
    setup();
    expect(screen.getByTestId('settings.logout-dialog').parentElement).toHaveStyle({ zIndex: '200' });
  });

  it('alertdialog이고 이름은 확인 문구이며 처음 포커스는 취소 버튼이다', () => {
    setup();
    const dialog = screen.getByTestId('settings.logout-dialog');
    expect(dialog).toHaveAttribute('role', 'alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('정말요?');
    expect(screen.getByTestId('settings.logout-cancel-button')).toHaveFocus();
    expect(screen.getByTestId('settings.logout-confirm-button')).not.toHaveAttribute('data-emphasis');
  });

  it('destructive면 확인 버튼에 data-emphasis="destructive"가 붙는다', () => {
    setup({ destructive: true });
    expect(screen.getByTestId('settings.logout-confirm-button')).toHaveAttribute('data-emphasis', 'destructive');
  });

  it('Esc는 취소다', async () => {
    const { onCancel } = setup();
    await userEvent.setup().keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('처리 중에는 aria-busy, 확인 비활성, 취소 aria-disabled이고 Esc·취소 클릭을 무시한다', async () => {
    const { onCancel, onConfirm } = setup({ busy: true });
    expect(screen.getByTestId('settings.logout-dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('settings.logout-confirm-button')).toBeDisabled();
    expect(screen.getByTestId('settings.logout-cancel-button')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.setup().keyboard('{Escape}');
    fireEvent.click(screen.getByTestId('settings.logout-cancel-button'));
    fireEvent.click(screen.getByTestId('settings.logout-confirm-button'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
