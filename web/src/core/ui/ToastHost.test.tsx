import { act, render, screen } from '@testing-library/react';
import { ToastController } from './ToastController';
import { ToastHost } from './ToastHost';
import { FakeClock } from '../time/FakeClock';
import { SequentialIdGenerator } from '../../test/sequentialIds';

function setup() {
  const clock = new FakeClock();
  const controller = new ToastController({ clock, ids: new SequentialIdGenerator() });
  render(<ToastHost controller={controller} />);
  return { clock, controller };
}

describe('ToastHost', () => {
  it('REQ-NET-032 토스트가 없으면 toast.container가 DOM에 없다', () => {
    setup();
    expect(screen.queryByTestId('toast.container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toast.message')).not.toBeInTheDocument();
  });

  it('REQ-NET-030 toast.message에 문구를 그리고 2.5초 뒤 DOM에서 뺀다', async () => {
    const { clock, controller } = setup();
    act(() => controller.show('네트워크 연결을 확인해 주세요.'));
    expect(screen.getByTestId('toast.container')).toBeInTheDocument();
    expect(screen.getByTestId('toast.message')).toHaveTextContent('네트워크 연결을 확인해 주세요.');
    await act(() => clock.advance(2_500));
    expect(screen.queryByTestId('toast.container')).not.toBeInTheDocument();
  });

  it('TC-NET-046 같은 문구 연속 표시도 새로 그려진다(요소가 교체된다)', async () => {
    const { clock, controller } = setup();
    act(() => controller.show('같은 문구'));
    const first = screen.getByTestId('toast.message');
    await act(() => clock.advance(1_000));
    act(() => controller.show('같은 문구'));
    const second = screen.getByTestId('toast.message');
    expect(second).not.toBe(first);
    expect(second).toHaveTextContent('같은 문구');
  });

  it('REQ-NET-032 토스트는 사용자 입력을 막지 않는다(pointer-events: none)', () => {
    const { controller } = setup();
    act(() => controller.show('x'));
    expect(screen.getByTestId('toast.container')).toHaveStyle({ pointerEvents: 'none' });
  });
});
