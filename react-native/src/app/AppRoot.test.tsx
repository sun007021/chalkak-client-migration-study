import { render } from '@testing-library/react-native';

import { AppRoot } from './AppRoot';

const mockUseFonts = jest.fn();
const mockHideAsync = jest.fn(async () => undefined);

jest.mock('expo-font', () => ({ useFonts: (...args: unknown[]) => mockUseFonts(...args) }));
jest.mock('expo-splash-screen', () => ({
  hideAsync: () => mockHideAsync(),
  preventAutoHideAsync: jest.fn(async () => true),
}));
jest.mock('./App', async () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { App: () => <View testID="app-root-child" /> };
});

describe('AppRoot', () => {
  beforeEach(() => {
    mockUseFonts.mockReset();
    mockHideAsync.mockClear();
  });

  it('글꼴 로딩이 끝나기 전에는 앱을 그리지 않고 스플래시를 유지한다', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    const { queryByTestId } = await render(<AppRoot configResult={{ ok: false } as never} />);
    expect(queryByTestId('app-root-child')).toBeNull();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it('글꼴이 준비되면 앱을 그리고 스플래시를 숨긴다', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    const { getByTestId } = await render(<AppRoot configResult={{ ok: false } as never} />);
    expect(getByTestId('app-root-child')).toBeTruthy();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it('글꼴 로딩이 실패해도 앱은 시작한다', async () => {
    mockUseFonts.mockReturnValue([false, new Error('font')]);
    const { getByTestId } = await render(<AppRoot configResult={{ ok: false } as never} />);
    expect(getByTestId('app-root-child')).toBeTruthy();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });
});
