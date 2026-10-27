import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Observable } from './Observable';
import { useViewModelState } from './useViewModelState';

class CounterVM extends Observable<{ count: number }> {
  constructor() {
    super({ count: 0 });
  }
  increment() {
    this.setState((s) => ({ count: s.count + 1 }));
  }
}

function CounterView({ vm }: { vm: CounterVM }) {
  const { count } = useViewModelState(vm);
  return <Text testID="counter.value">{count}</Text>;
}

describe('useViewModelState', () => {
  it('ViewModel 상태 변화를 화면에 반영한다', async () => {
    const vm = new CounterVM();
    await render(<CounterView vm={vm} />);
    expect(screen.getByTestId('counter.value')).toHaveTextContent('0');
    await act(async () => vm.increment());
    expect(screen.getByTestId('counter.value')).toHaveTextContent('1');
  });
});
