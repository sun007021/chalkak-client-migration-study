import { StrictMode, useState } from 'react';
import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalyticsProvider } from './AnalyticsContext';
import { AnalyticsReporter } from './AnalyticsReporter';
import { FakeAnalyticsTracker } from './AnalyticsTracker';
import { useScreenView } from './useScreenView';

function Screen({ name }: { name: 'home' | 'feed' }) {
  const [n, setN] = useState(0);
  useScreenView(name);
  return <button data-testid="bump" onClick={() => setN(n + 1)}>{n}</button>;
}

function setup() {
  const tracker = new FakeAnalyticsTracker();
  const reporter = new AnalyticsReporter({ tracker });
  const wrap = (ui: React.ReactNode) => (
    <StrictMode>
      <AnalyticsProvider reporter={reporter}>{ui}</AnalyticsProvider>
    </StrictMode>
  );
  return { tracker, wrap };
}

describe('useScreenView', () => {
  it('TC-ANL-018 StrictMode 이중 effect와 상태 변경 재렌더에도 screen_view는 1회다', async () => {
    const { tracker, wrap } = setup();
    const view = render(wrap(<Screen name="home" />));
    await userEvent.click(view.getByTestId('bump'));
    await userEvent.click(view.getByTestId('bump'));
    view.rerender(wrap(<Screen name="home" />));
    expect(tracker.events).toEqual([{ name: 'screen_view', params: { screen_name: 'home' } }]);
  });

  it('TC-ANL-017 화면을 떠났다가 다시 마운트되면(뒤로가기 복귀) 다시 전송한다', () => {
    const { tracker, wrap } = setup();
    const view = render(wrap(<Screen name="home" />));
    view.rerender(wrap(<Screen name="feed" />));
    view.unmount();
    render(wrap(<Screen name="home" />));
    expect(tracker.events.map((e) => (e.name === 'screen_view' ? e.params.screen_name : ''))).toEqual(['home', 'feed', 'home']);
  });

  it('TC-ANL-018 화면 이름이 바뀌는 렌더는 새 화면으로 보고 1회 전송한다', () => {
    const { tracker, wrap } = setup();
    const view = render(wrap(<Screen name="home" />));
    act(() => view.rerender(wrap(<Screen name="feed" />)));
    expect(tracker.events).toHaveLength(2);
  });
});
