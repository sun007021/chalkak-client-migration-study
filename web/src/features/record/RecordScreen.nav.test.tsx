import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { toastText } from '../../test/postScreens';
import { OTHER, TODAY, dateRoutes, deleteKey, detailKey } from '../../test/postRoutes';
import { OCT, OCT_20, SEP, SEP_17, monthResponse, recPostId, recordRequests, thumbOf } from '../../test/recordRoutes';
import { openRecordApp, recordLoaded } from '../../test/recordScreens';
import { screenViews } from '../../test/screenViews';

vi.setConfig({ testTimeout: 15_000 });

const tid = (id: string) => screen.getByTestId(id);
const maybe = (id: string) => screen.queryByTestId(id);
const click = (id: string) => fireEvent.click(tid(id));
const search = (router: { state: { location: { search: string } } }) => new URLSearchParams(router.state.location.search);

describe('게스트와 인증 (TC-REC-033, REQ-REC-040)', () => {
  it('TC-REC-033 TC-ANL-016 게스트가 하단 바의 기록 탭을 누르면 토스트 "기록을 보려면 로그인이 필요해요"만 뜨고 탭이 바뀌지 않으며 기록 요청이 0건이다', async () => {
    const { h, router } = await openRecordApp({ mode: 'guest', path: '/home' });
    click('bottom-bar.tab-record');
    await waitFor(() => expect(toastText()).toBe(t('record.guest')));
    expect(router.state.location.pathname).toBe('/home');
    expect(maybe('record.root')).not.toBeInTheDocument();
    expect(recordRequests(h.ff.calls)).toEqual([]);
    expect(h.tracker.events.filter((e) => e.name === 'bottom_navigation_selected')).toEqual([]); // TC-ANL-016 임시안: 미전송
  });

  it('TC-REC-033 게스트가 /record URL로 직접 들어오면 화면을 열지 않고 홈으로 보내며 토스트만 뜨고 기록 API를 부르지 않는다', async () => {
    const { h, router } = await openRecordApp({ mode: 'guest', waitFor: 'home.root' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(toastText()).toBe(t('record.guest'));
    expect(maybe('record.root')).not.toBeInTheDocument();
    expect(recordRequests(h.ff.calls)).toEqual([]);
    expect(screenViews(h.tracker)).not.toContain('record');
  });
});

describe('화면 추적 (TC-REC-042, D-22)', () => {
  it('TC-REC-042 기록 화면이 그려지면 screen_view record가 한 번 전송되고 월 이동·재검증으로 다시 보내지 않는다', async () => {
    const { h } = await openRecordApp();
    await recordLoaded();
    click('record.prev-month-button');
    await waitFor(() => expect(tid('record.month-label')).toHaveTextContent('2026년 9월'));
    click('record.next-month-button');
    click('bottom-bar.tab-record');
    await act(async () => undefined);
    expect(screenViews(h.tracker).filter((name) => name === 'record')).toEqual(['record']);
  });

  it('TC-REC-042 StrictMode의 이중 효과에도 screen_view는 한 번이다', async () => {
    const { h } = await openRecordApp({ strict: true });
    await recordLoaded();
    expect(screenViews(h.tracker)).toEqual(['record']);
  });
});

describe('URL 진입과 동기화 (REQ-REC-032, TC-REC-025, 026)', () => {
  it('TC-REC-025 /record?date=2026-09-17로 열면 그 달·날짜가 선택되고 현재 달 달력은 요청하지 않는다', async () => {
    const { h, fixtures } = await openRecordApp({ path: '/record?date=2026-09-17' });
    await recordLoaded();
    expect(tid('record.month-label')).toHaveTextContent('2026년 9월');
    expect(tid('record.day-2026-09-17')).toHaveAttribute('aria-selected', 'true');
    expect(within9(tid('record.selected-photo'))).toBe(thumbOf(SEP_17));
    expect(fixtures.calls(OCT)).toHaveLength(0);
    expect(fixtures.calls(SEP)).toHaveLength(1);
    expect(recordRequests(h.ff.calls).filter((r) => r.startsWith('/posts/calendar?'))).toEqual(['/posts/calendar?year=2026&month=9']);
  });

  it('REQ-REC-032 지정한 날짜에 사진이 없으면 가까운 사진을 대신 열지 않고 기본 선택(가장 늦은 날짜)이다', async () => {
    await openRecordApp({ path: '/record?date=2026-10-22' });
    await recordLoaded();
    expect(tid('record.day-2026-10-31')).toHaveAttribute('aria-selected', 'true');
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'false');
  });

  it('REQ-REC-032 잘못된 date 값은 무시하고 기본 선택을 연다', async () => {
    await openRecordApp({ path: '/record?date=garbage' });
    await recordLoaded();
    expect(tid('record.month-label')).toHaveTextContent('2026년 10월');
    expect(tid('record.day-2026-10-31')).toHaveAttribute('aria-selected', 'true');
  });

  it('선택한 날짜가 URL ?date=에 replace로 반영되고 location.state(homeBelow)는 보존된다', async () => {
    const { router } = await openRecordApp({ path: { pathname: '/record', state: { homeBelow: true } } });
    await recordLoaded();
    await waitFor(() => expect(search(router).get('date')).toBe('2026-10-31'));
    click('record.day-2026-10-20');
    await waitFor(() => expect(search(router).get('date')).toBe('2026-10-20'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.pathname).toBe('/record');
    expect(router.state.location.state).toEqual({ homeBelow: true });
  });

  it('월을 옮기면 그 달의 기본 선택 날짜가 URL에 반영된다', async () => {
    const { router } = await openRecordApp();
    await recordLoaded();
    click('record.prev-month-button');
    await waitFor(() => expect(search(router).get('date')).toBe('2026-09-30'));
  });

  it('주소가 바깥에서 바뀌면(Link·홈에서 들어옴) 그 날짜가 선택된다', async () => {
    const { router } = await openRecordApp();
    await recordLoaded();
    await act(async () => void router.navigate('/record?date=2026-10-20'));
    await waitFor(() => expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'true'));
    await act(async () => void router.navigate('/record?date=2026-09-17'));
    await waitFor(() => expect(tid('record.month-label')).toHaveTextContent('2026년 9월'));
    expect(tid('record.day-2026-09-17')).toHaveAttribute('aria-selected', 'true');
  });

  it('TC-NAV-010 TC-REC-025 date 없이 /record로 다시 들어와도(탭 이동) 보던 달과 선택 날짜가 유지된다', async () => {
    const { router } = await openRecordApp({ path: '/record?date=2026-10-20' });
    await recordLoaded();
    await act(async () => void router.navigate('/display'));
    await screen.findByTestId('display.root');
    await act(async () => void router.navigate('/record'));
    await screen.findByTestId('record.calendar-grid');
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'true');
    expect(tid('record.month-label')).toHaveTextContent('2026년 10월');
  });
});

describe('기록 → 피드·전시 (TC-REC-034)', () => {
  const approvedToday = monthResponse(2026, 10, [
    ['2026-10-20', OCT_20, 'APPROVED'],
    ['2026-10-27', OTHER, 'APPROVED'],
  ]);

  it('TC-REC-034 "피드에서 보기"는 게시물 상세(/feed/{postId})를 push하고 state에 내 게시물 가정과 썸네일을 싣는다', async () => {
    const { router } = await openRecordApp({ routes: { [OCT]: approvedToday } });
    await recordLoaded();
    click('record.day-2026-10-27');
    click('record.view-feed-button');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/feed/${OTHER}`));
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.state).toMatchObject({ assumeMine: true, thumbnailImageUrl: thumbOf(OTHER) });
    await screen.findByTestId('feed.root');
  });

  it('TC-FEED-004 TC-REC-034 기록에서 연 상세는 응답 전 썸네일을 미리 보이고 응답 뒤에도 내 게시물(삭제 버튼)로 유지된다', async () => {
    const gate = deferred<void>();
    await openRecordApp({ routes: { [OCT]: approvedToday, [detailKey(OTHER)]: gated(gate, 'feed/posts-detail__other') } });
    await recordLoaded();
    click('record.day-2026-10-27');
    click('record.view-feed-button');
    await screen.findByTestId('feed.root');
    expect(document.querySelector(`[data-testid="feed.root"] img[src="${thumbOf(OTHER)}"]`)).not.toBeNull();
    await act(async () => gate.resolve());
    await waitFor(() => expect(maybe('feed.loading')).not.toBeInTheDocument());
    expect(tid('feed.delete-button')).toBeInTheDocument(); // 작성자가 다른 사람이어도 기록에서 연 것은 내 게시물로 둔다
  });

  it('TC-REC-034 상세에서 닫으면 기록으로 돌아와 보던 달·선택 날짜를 유지하고 재검증한다', async () => {
    const { router, fixtures } = await openRecordApp({ routes: { [OCT]: approvedToday } });
    await recordLoaded();
    click('record.day-2026-10-20');
    click('record.view-feed-button');
    await screen.findByTestId('feed.root');
    click('feed.back-button');
    await screen.findByTestId('record.calendar-grid');
    expect(router.state.location.pathname).toBe('/record');
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'true');
    expect(tid('record.month-label')).toHaveTextContent('2026년 10월');
    await waitFor(() => expect(fixtures.calls(OCT).length).toBeGreaterThanOrEqual(2));
  });

  it('TC-REC-034 TC-FEED-004 기록에서 연 상세에서 그 게시물을 직접 삭제하면 기록으로 돌아와 칸이 비고 선택이 옮겨 간다', async () => {
    const { router, fixtures } = await openRecordApp({ routes: { [OCT]: approvedToday, [deleteKey(OTHER)]: 'feed/posts-delete__204' } });
    await recordLoaded();
    click('record.day-2026-10-27');
    click('record.view-feed-button');
    await screen.findByTestId('feed.root');
    await waitFor(() => expect(maybe('feed.delete-button')).toBeInTheDocument()); // 작성자가 다른 사람이어도 기록에서 연 것은 내 게시물이다
    click('feed.delete-button');
    fireEvent.click(await screen.findByTestId('feed.delete-confirm-button'));
    await screen.findByTestId('record.calendar-grid');
    expect(router.state.location.pathname).toBe('/record');
    expect(fixtures.calls(deleteKey(OTHER))).toHaveLength(1);
    expect(maybe('record.day-photo-2026-10-27')).not.toBeInTheDocument();
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'true'); // 같은 달의 남은 가장 늦은 사진
  });

  it('TC-REC-034 REQ-REC-035 "전시 보러가기"는 그 사진의 topicDate 전시를 push하고 뒤로 가면 기록으로 돌아온다', async () => {
    const { router, fixtures } = await openRecordApp({ routes: { ...dateRoutes('2026-10-20', 'popular', 'display/posts-list__popular-page1', '단풍') } });
    await recordLoaded();
    click('record.day-2026-10-20');
    click('record.view-display-button');
    await waitFor(() => expect(router.state.location.pathname).toBe('/display'));
    expect(new URLSearchParams(router.state.location.search).get('date')).toBe('2026-10-20');
    await screen.findByTestId('display.grid');
    expect(tid('display.date-label')).toHaveTextContent('10월 20일');
    await act(async () => void router.navigate(-1));
    await screen.findByTestId('record.calendar-grid');
    expect(router.state.location.pathname).toBe('/record');
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(fixtures.calls(OCT).length).toBeGreaterThanOrEqual(2));
  });

  it('TC-REC-034 삭제는 상세에서 마치고 돌아오면 즉시 기록 화면에서 칸이 비어 있다(removed 이벤트)', async () => {
    const { h } = await openRecordApp({ routes: { [OCT]: approvedToday } });
    await recordLoaded();
    click('record.day-2026-10-27');
    click('record.view-feed-button');
    await screen.findByTestId('feed.root');
    act(() => h.container.postChanges.publish({ type: 'removed', postId: OTHER }));
    // 테스트 수정: 삭제 이벤트를 받은 상세는 스스로 닫혀 기록으로 돌아온다(뒤로 가기 버튼이 이미 없다).
    await screen.findByTestId('record.calendar-grid');
    expect(maybe('record.day-photo-2026-10-27')).not.toBeInTheDocument();
  });
});

describe('업로드 반영 (TC-REC-043)', () => {
  it('TC-REC-043 업로드 성공(PostChange created) 뒤 기록 탭으로 이동하면 오늘 칸에 새 사진이 나타난다', async () => {
    const withoutToday = monthResponse(2026, 10, [['2026-10-20', OCT_20, 'APPROVED']]);
    const { h, router } = await openRecordApp({ routes: { [OCT]: [withoutToday, 'record/posts-calendar__2026-10'] }, path: '/display', waitFor: 'display.root' });
    await act(async () => void router.navigate('/record'));
    await recordLoaded();
    expect(maybe('record.day-photo-2026-10-27')).not.toBeInTheDocument();
    await act(async () => void router.navigate('/display'));
    await screen.findByTestId('display.root');
    act(() => h.container.postChanges.publish({ type: 'created', postId: recPostId(201), topicDate: TODAY, moderationStatus: 'PENDING' }));
    await act(async () => void router.navigate('/record'));
    await waitFor(() => expect(maybe('record.day-photo-2026-10-27')).toBeInTheDocument());
    expect(maybe('record.day-pending-2026-10-27')).toBeInTheDocument();
  });
});

describe('계정 전환 (TC-REC-028)', () => {
  it('TC-REC-028 로그아웃·계정 전환(UserCaches) 뒤 기록 탭에 다시 들어오면 이전 계정의 달력·선택이 남지 않는다', async () => {
    const gate = deferred<void>();
    const { h, router } = await openRecordApp({ routes: { [OCT]: ['record/posts-calendar__2026-10', gated(gate, 'record/posts-calendar__2026-10-after-delete')] } });
    await recordLoaded();
    click('record.day-2026-10-20');
    await act(async () => void router.navigate('/display'));
    await screen.findByTestId('display.root');
    await act(async () => h.container.userCaches.clearAll());
    await act(async () => void router.navigate('/record'));
    expect(await screen.findByTestId('record.loading')).toBeInTheDocument();
    expect(maybe('record.day-photo-2026-10-20')).not.toBeInTheDocument();
    await act(async () => gate.resolve());
    await recordLoaded();
    expect(maybe('record.day-photo-2026-10-27')).not.toBeInTheDocument(); // B 계정의 응답
  });
});

function within9(panel: HTMLElement): string | null {
  return panel.querySelector('img')?.getAttribute('src') ?? null;
}
