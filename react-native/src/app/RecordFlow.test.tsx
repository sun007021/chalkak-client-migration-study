import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FixtureRouter, type RouteValue } from '../data/__testing__/FixtureRouter';
import { datedRoutes } from '../features/display/__testing__/createDisplayHarness';
import { GUEST_ROUTES, MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import {
  FakeCalendarImageRenderer,
  FakeCalendarImageSaver,
} from '../features/record/__testing__/FakeCalendarImage';
import { MONTHS, P_1031, RECORD_ROUTES } from '../features/record/__testing__/createRecordHarness';
import { t } from '../shared/copy';
import { App } from './App';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;
const MINE_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** 홈 fixture 위에 기록·상세·전시 라우트를 얹은 가짜 서버. */
async function renderApp(mode: 'member' | 'guest', extra: Record<string, RouteValue> = {}) {
  const net = createNetHarness();
  net.clock.set(NOW);
  if (mode === 'member') await net.signIn({ userId: MINE_USER });
  else await net.sessionStore.enterGuest();
  const router = new FixtureRouter(
    mode === 'member'
      ? {
          ...MEMBER_ROUTES,
          ...RECORD_ROUTES,
          [`GET /posts/${P_1031}`]: 'feed/posts-detail__mine-today',
          ...datedRoutes(['2026-10-31']),
          ...extra,
        }
      : GUEST_ROUTES,
  ).install(net.transport);
  const analytics = new FakeAnalyticsTracker();
  const imageRenderer = new FakeCalendarImageRenderer();
  const imageSaver = new FakeCalendarImageSaver();
  await render(
    <App
      configResult={OK}
      overrides={{
        clock: net.clock,
        sessionStore: net.sessionStore,
        events: net.events,
        api: net.api,
        analytics,
        calendarImageRenderer: imageRenderer,
        calendarImageSaver: imageSaver,
      }}
    />,
  );
  return { net, router, analytics, imageSaver };
}

async function openRecordTab() {
  await screen.findByTestId('bottom-bar.root');
  await fireEvent.press(screen.getByTestId('bottom-bar.tab-record'));
  return screen.findByTestId('record.calendar-grid');
}

describe('기록 탭 연결', () => {
  it('TC-REC-001 TC-REC-042 기록 탭을 누르면 월 목록과 현재 달 달력을 불러와 보여 주고 screen_view record를 1회 보낸다', async () => {
    const { router, analytics } = await renderApp('member');
    await openRecordTab();
    expect(screen.getByTestId('bottom-bar.tab-record')).toBeSelected();
    expect(screen.getByTestId('record.root')).toBeOnTheScreen();
    expect(screen.getByTestId('record.day-photo-2026-10-31')).toBeOnTheScreen();
    expect(router.calls(MONTHS)).toHaveLength(1);
    expect(analytics.screenNames.filter((name) => name === 'record')).toEqual(['record']);
  });

  it('TC-REC-033 게스트가 기록 탭을 누르면 토스트만 뜨고 탭이 바뀌지 않으며 기록 API 요청이 0건이다', async () => {
    const { net } = await renderApp('guest');
    await screen.findByTestId('bottom-bar.root');
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-record'));
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(t('record.guest'));
    expect(screen.queryByTestId('record.root')).not.toBeOnTheScreen();
    expect(net.transport.requests.filter((r) => r.url.includes('/posts/calendar'))).toHaveLength(0);
  });

  it('TC-REC-034 "피드에서 보기"는 내 게시물 상세를 열고 뒤로 가면 기록으로 복귀한다', async () => {
    await renderApp('member');
    await openRecordTab();
    await fireEvent.press(screen.getByTestId('record.view-feed-button'));
    expect(await screen.findByTestId('feed.root')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('feed.back-button'));
    expect(await screen.findByTestId('record.root')).toBeOnTheScreen();
    expect(screen.getByTestId('record.day-2026-10-31')).toBeSelected();
  });

  it('TC-REC-034 "전시 보러가기"는 해당 주제 날짜의 전시를 연다(뒤로 가면 기록 복귀는 E 범위)', async () => {
    await renderApp('member');
    await openRecordTab();
    await fireEvent.press(screen.getByTestId('record.view-display-button'));
    expect(await screen.findByTestId('display.date-label')).toHaveTextContent('10월 31일');
    expect(screen.getByTestId('bottom-bar.tab-display')).toBeSelected();
  });

  it('TC-REC-025 홈 주간 기록에서 날짜를 눌러 기록으로 가면 그 날짜가 최신 사진보다 우선 선택된다', async () => {
    await renderApp('member');
    await fireEvent.press(await screen.findByTestId('home.week-day-2026-10-27'));
    expect(await screen.findByTestId('record.calendar-grid')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('record.day-2026-10-27')).toBeSelected());
    expect(screen.getByTestId('record.day-2026-10-31')).not.toBeSelected();
  });

  it('TC-REC-022 기록 탭을 떠났다 돌아오면 재검증하고, 이미 보는 중에 탭을 다시 누르면 재검증한다', async () => {
    const { router } = await renderApp('member');
    await openRecordTab();
    const cal = 'GET /posts/calendar?year=2026&month=10';
    const before = router.calls(cal).length;
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-record'));
    await waitFor(() => expect(router.calls(cal).length).toBeGreaterThan(before));
    const afterReselect = router.calls(cal).length;
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-home'));
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-record'));
    await waitFor(() => expect(router.calls(cal).length).toBeGreaterThan(afterReselect));
    expect(screen.getByTestId('record.calendar-grid')).toBeOnTheScreen();
  });

  it('TC-REC-038 "이미지로 저장"은 컨테이너의 렌더러·저장소로 저장하고 토스트를 띄운다', async () => {
    const { imageSaver } = await renderApp('member');
    await openRecordTab();
    await fireEvent.press(screen.getByTestId('record.save-image-button'));
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(t('record.save.ok'));
    expect(imageSaver.saved.map((s) => s.fileName)).toEqual(['chalkak-calendar-2026-10.png']);
  });
});
