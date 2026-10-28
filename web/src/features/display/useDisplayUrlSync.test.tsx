import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { useDisplayUrlSync } from './useDisplayUrlSync';
import type { DisplayState, DisplayViewModel } from './DisplayViewModel';

type Sync = Pick<DisplayState, 'date' | 'sort' | 'today'>;
const TODAY = '2026-10-27';

function setup(search = '') {
  const vm = { state: { date: TODAY, sort: 'recent', today: TODAY } as Sync, applyRoute: vi.fn().mockResolvedValue(undefined) };
  let setState: (state: Sync) => void = () => undefined;
  function Host(): null {
    const [state, set] = useState<Sync>(vm.state);
    setState = set;
    useDisplayUrlSync(vm as unknown as DisplayViewModel, state);
    return null;
  }
  const router = createMemoryRouter([{ path: '*', element: <Host /> }], { initialEntries: [`/display${search}`] });
  render(<RouterProvider router={router} />);
  const move = (next: Partial<Sync>) => {
    vm.state = { ...vm.state, ...next };
    setState(vm.state);
  };
  return { vm, router, move };
}

describe('useDisplayUrlSync (코드리뷰 4)', () => {
  it('마운트하면 URL의 값으로 applyRoute를 한 번 부른다', async () => {
    const { vm } = setup('?date=2026-10-25&sort=popular');
    await act(async () => undefined);
    expect(vm.applyRoute).toHaveBeenCalledTimes(1);
    expect(vm.applyRoute).toHaveBeenCalledWith({ date: '2026-10-25', sort: 'popular' });
  });

  it('상태가 바뀌면 replace로 URL을 쓰고, 그 URL이 돌아와도 applyRoute를 다시 부르지 않는다', async () => {
    const { vm, router, move } = setup();
    await act(async () => undefined);
    await act(async () => move({ date: '2026-10-26', sort: 'popular' }));
    expect(router.state.location.search).toBe('?date=2026-10-26&sort=popular');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(vm.applyRoute).toHaveBeenCalledTimes(1);
  });

  it('B로 쓰는 중에 C로 옮기면 늦게 도착한 B가 상태를 되돌리지 않는다(applyRoute 추가 호출 없음, 최종 URL은 C)', async () => {
    const { vm, router, move } = setup();
    await act(async () => undefined);
    await act(async () => {
      move({ date: '2026-10-26', sort: 'popular' });
      move({ date: '2026-10-25', sort: 'popular' });
    });
    await act(async () => undefined);
    expect(vm.applyRoute).toHaveBeenCalledTimes(1);
    expect(router.state.location.search).toBe('?date=2026-10-25&sort=popular');
  });

  it('쓰는 중에 처음 값으로 돌아오면 곧 도착할 URL과 비교해 다시 쓴다(URL이 B로 남지 않는다)', async () => {
    const { vm, router, move } = setup();
    await act(async () => undefined);
    await act(async () => {
      move({ date: '2026-10-26', sort: 'popular' });
      move({ date: TODAY, sort: 'recent' });
    });
    await act(async () => undefined);
    expect(vm.applyRoute).toHaveBeenCalledTimes(1);
    const { date, sort } = Object.fromEntries(new URLSearchParams(router.state.location.search));
    expect({ date: date ?? TODAY, sort: sort ?? 'recent' }).toEqual({ date: TODAY, sort: 'recent' });
  });

  it('바깥에서 URL이 바뀌면 applyRoute로 반영한다', async () => {
    const { vm, router } = setup();
    await act(async () => undefined);
    await act(async () => {
      await router.navigate('/display?date=2026-10-20&sort=popular');
    });
    expect(vm.applyRoute).toHaveBeenLastCalledWith({ date: '2026-10-20', sort: 'popular' });
    expect(vm.applyRoute).toHaveBeenCalledTimes(2);
  });
});
