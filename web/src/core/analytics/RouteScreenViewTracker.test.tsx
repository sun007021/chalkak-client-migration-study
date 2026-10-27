import { StrictMode, useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { AnalyticsProvider } from './AnalyticsContext';
import { AnalyticsReporter } from './AnalyticsReporter';
import { FakeAnalyticsTracker } from '../../test/FakeAnalyticsTracker';
import { RouteScreenViewTracker } from './RouteScreenViewTracker';
import type { ScreenName } from '../../constants';

const resolve = (p: string): ScreenName | null => ({ '/': 'home', '/display': 'display', '/settings': 'settings' })[p] as ScreenName | undefined ?? null;

const navRef: { current: ReturnType<typeof useNavigate> | null } = { current: null };
function Capture() {
  const navigate = useNavigate();
  useEffect(() => {
    navRef.current = navigate;
  });
  return null;
}
const nav = ((to: string | number) => navRef.current!(to as never)) as ReturnType<typeof useNavigate>;

function setup(initial = '/') {
  const tracker = new FakeAnalyticsTracker();
  const reporter = new AnalyticsReporter({ tracker });
  render(
    <StrictMode>
      <AnalyticsProvider reporter={reporter}>
        <MemoryRouter initialEntries={[initial]}>
          <RouteScreenViewTracker resolve={resolve} />
          <Capture />
        </MemoryRouter>
      </AnalyticsProvider>
    </StrictMode>,
  );
  const names = () => tracker.events.map((e) => (e.name === 'screen_view' ? e.params.screen_name : e.name));
  return { names };
}

describe('RouteScreenViewTracker', () => {
  it('TC-ANL-025 초기 로드에 screen_view 1회(StrictMode여도), 라우트 변경마다 1회씩 전송한다', () => {
    const { names } = setup('/');
    expect(names()).toEqual(['home']);
    act(() => void nav('/display'));
    act(() => void nav('/settings'));
    expect(names()).toEqual(['home', 'display', 'settings']);
  });

  it('TC-ANL-017 TC-ANL-025 뒤로가기로 복귀해도 복귀한 화면의 screen_view를 다시 보낸다', () => {
    const { names } = setup('/');
    act(() => void nav('/display'));
    act(() => void nav(-1));
    expect(names()).toEqual(['home', 'display', 'home']);
  });

  it('TC-ANL-025 화면 이름이 없는 경로(null)는 전송하지 않는다', () => {
    const { names } = setup('/');
    act(() => void nav('/not-a-screen'));
    expect(names()).toEqual(['home']);
  });

  it('TC-ANL-025 쿼리·해시만 바뀌는 이동은 같은 화면이라 다시 보내지 않는다', () => {
    const { names } = setup('/display');
    expect(names()).toEqual(['display']);
    act(() => void nav('/display?date=2026-10-26'));
    act(() => void nav('/display?date=2026-10-25#top'));
    expect(names()).toEqual(['display']);
  });

  it('TC-ANL-017 TC-ANL-025 다른 화면에 갔다가 같은 화면으로 돌아오면(쿼리가 붙어 있어도) 다시 보낸다', () => {
    const { names } = setup('/display');
    act(() => void nav('/settings'));
    act(() => void nav('/display?date=2026-10-26'));
    expect(names()).toEqual(['display', 'settings', 'display']);
  });
});
