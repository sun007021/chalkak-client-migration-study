import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Counter } from './__testing__/Counter';
import { useViewModelState } from './useViewModelState';

function setup(vm: Counter) {
  const renders = { whole: 0, count: 0 };
  function Whole() {
    const { count } = useViewModelState(vm);
    renders.whole += 1;
    return <Text testID="whole">{count}</Text>;
  }
  function OnlyCount() {
    const count = useViewModelState(vm, (s) => s.count);
    renders.count += 1;
    return <Text testID="count">{count}</Text>;
  }
  return { renders, Whole, OnlyCount };
}

describe('useViewModelState', () => {
  it('ViewModel 상태 변화를 화면에 반영한다', async () => {
    const vm = new Counter();
    const { Whole } = setup(vm);
    await render(<Whole />);
    expect(screen.getByTestId('whole')).toHaveTextContent('0');
    await act(async () => vm.increment());
    expect(screen.getByTestId('whole')).toHaveTextContent('1');
  });

  it('unmount하면 구독을 해제한다', async () => {
    const vm = new Counter();
    const { Whole } = setup(vm);
    const view = await render(<Whole />);
    expect(vm.firstSubscribeCalls).toBe(1);
    await view.unmount();
    expect(vm.lastUnsubscribeCalls).toBe(1);
  });

  it('같은 상태로 setState하면 리렌더하지 않는다', async () => {
    const vm = new Counter();
    const { Whole, renders } = setup(vm);
    await render(<Whole />);
    const before = renders.whole;
    await act(async () => vm.noop());
    expect(renders.whole).toBe(before);
  });

  it('selector는 무관한 필드가 바뀌어도 리렌더하지 않고, 선택한 값이 바뀌면 리렌더한다', async () => {
    const vm = new Counter();
    const { OnlyCount, renders } = setup(vm);
    await render(<OnlyCount />);
    const before = renders.count;

    await act(async () => vm.setLabel('다른 필드'));
    expect(renders.count).toBe(before);

    await act(async () => vm.increment());
    expect(renders.count).toBeGreaterThan(before);
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('인라인 selector가 매 렌더 새 함수여도 안정적으로 동작한다', async () => {
    const vm = new Counter();
    function Inline() {
      const label = useViewModelState(vm, (s) => `#${s.count}`);
      return <Text testID="inline">{label}</Text>;
    }
    await render(<Inline />);
    await act(async () => vm.increment());
    expect(screen.getByTestId('inline')).toHaveTextContent('#1');
  });
});
