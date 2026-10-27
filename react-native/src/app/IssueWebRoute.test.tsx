import { render, screen } from '@testing-library/react-native';
import { StrictMode } from 'react';

import { createIssueWebHarness } from '../features/banner/__testing__/createIssueWebHarness';
import type { IssueWebViewModel } from '../features/banner/IssueWebViewModel';
import type { AppContainer } from './AppContainer';
import { AppContainerProvider } from './AppContainerContext';
import { IssueWebRoute } from './IssueWebRoute';

function setup() {
  const created: IssueWebViewModel[] = [];
  const disposed: IssueWebViewModel[] = [];
  const container = {
    createIssueWebViewModel: (url: string) => {
      const vm = createIssueWebHarness(url).viewModel;
      const dispose = vm.dispose.bind(vm);
      vm.dispose = () => {
        disposed.push(vm);
        dispose();
      };
      created.push(vm);
      return vm;
    },
  } as unknown as AppContainer;
  const tree = (
    <AppContainerProvider container={container}>
      <IssueWebRoute url="https://web.example.test/issues/1" onBack={jest.fn()} />
    </AppContainerProvider>
  );
  return { created, disposed, tree };
}

describe('IssueWebRoute 수명주기', () => {
  it('라우트가 사라지면 ViewModel을 dispose한다', async () => {
    const h = setup();
    const view = await render(h.tree);
    expect(screen.getByTestId('issue.root')).toBeOnTheScreen();
    expect(h.disposed).toHaveLength(0);
    await view.unmount();
    expect(h.disposed).toEqual([h.created[h.created.length - 1]]);
  });

  it('StrictMode의 effect 이중 실행 뒤에도 화면에 쓰이는 ViewModel은 dispose되지 않았다', async () => {
    const h = setup();
    const view = await render(<StrictMode>{h.tree}</StrictMode>);
    expect(screen.getByTestId('issue.root')).toBeOnTheScreen();
    const live = h.created.filter((vm) => !h.disposed.includes(vm));
    expect(live).toHaveLength(1);
    await view.unmount();
    expect(h.created.every((vm) => h.disposed.includes(vm))).toBe(true);
  });
});
