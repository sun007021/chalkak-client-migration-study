import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { FakeVisibilityObserver } from '../../test/FakeVisibilityObserver';
import { loadFixture } from '../../test/fixtures';
import { createLikeServer } from '../../test/likeServer';
import { OTHER, TODAY, YESTERDAY, dateRoutes, postsKey, topicKey } from '../../test/postRoutes';
import { advance, displayLoaded, idOf, openApp, stubScroll, toastText } from '../../test/postScreens';
import { screenViews } from '../../test/screenViews';

vi.setConfig({ testTimeout: 15_000 }); // 구현 전에는 findBy가 5초 뒤 단언 오류로 끝나게 한다(테스트 시간 초과로 가려지지 않게)

const RECENT_P1 = postsKey(TODAY, 'recent');
const RECENT_P2 = postsKey(TODAY, 'recent', 2);
const POPULAR_P1 = postsKey(TODAY, 'popular');
const tid = (id: string) => screen.getByTestId(id);
const pressed = (id: string) => tid(id).getAttribute('aria-pressed');
const itemIds = () => within(tid('display.grid')).getAllByTestId(/^display\.item-/).map((el) => el.getAttribute('data-testid')!.slice('display.item-'.length).slice(-3));

describe('전시 화면 구성 (TC-DISP-060, 041, 001)', () => {
  it('TC-DISP-060 TC-DISP-041 요소가 존재하고 날짜 라벨·주제 제목·설명이 보인다', async () => {
    await openApp();
    await displayLoaded();
    for (const id of ['display.root', 'display.date-label', 'display.prev-date-button', 'display.next-date-button', 'display.date-picker-button', 'display.topic-title', 'display.description', 'display.sort-recent-tab', 'display.sort-popular-tab', 'display.sort-random-tab', 'display.grid']) {
      expect(screen.getByTestId(id), id).toBeInTheDocument();
    }
    expect(tid('display.date-label')).toHaveTextContent('10월 27일');
    expect(tid('display.topic-title')).toHaveTextContent('가을 하늘');
    expect(tid('display.description')).toHaveTextContent(t('display.header.desc-latest'));
    expect(screen.getByTestId(`display.item-${OTHER}`)).toBeInTheDocument();
    expect(screen.queryByTestId('display.featured-pager')).not.toBeInTheDocument();
  });

  it('TC-DISP-001 응답 전에는 로딩 표시이고 날짜 이동 버튼은 비활성이다', async () => {
    const gate = deferred<void>();
    await openApp({ routes: { [RECENT_P1]: gated(gate, 'display/posts-list__recent-page1') } });
    expect(await screen.findByTestId('display.loading')).toBeInTheDocument();
    expect(tid('display.prev-date-button')).toBeDisabled();
    expect(tid('display.next-date-button')).toBeDisabled();
    await act(async () => gate.resolve());
    await displayLoaded();
    expect(tid('display.prev-date-button')).toBeEnabled();
    expect(tid('display.next-date-button')).toBeDisabled(); // 오늘
  });

  it('TC-DISP-011 정렬 탭 3개가 보이고 기본은 최신순이다(selected 상태 노출)', async () => {
    await openApp();
    await displayLoaded();
    expect(tid('display.sort-recent-tab')).toHaveAttribute('aria-selected', 'true');
    expect(tid('display.sort-popular-tab')).toHaveAttribute('aria-selected', 'false');
    expect(tid('display.sort-random-tab')).toHaveAttribute('aria-selected', 'false');
    expect(tid('display.sort-recent-tab')).toHaveTextContent(t('display.sort.recent'));
    expect(tid('display.sort-popular-tab')).toHaveTextContent(t('display.sort.popular'));
    expect(tid('display.sort-random-tab')).toHaveTextContent(t('display.sort.random'));
  });

  it('사진 카드 하트는 aria-pressed(isLiked)와 "좋아요 N개" 이름, 개수 요소를 갖는다(TC-LIKE-034)', async () => {
    await openApp();
    await displayLoaded();
    expect(pressed(`display.like-button-${OTHER}`)).toBe('false');
    expect(tid(`display.like-button-${OTHER}`)).toHaveAccessibleName('좋아요 38개');
    expect(tid(`display.like-count-${OTHER}`)).toHaveTextContent('38');
    expect(pressed(`display.like-button-${idOf(203)}`)).toBe('true');
  });

  it('전시 탭이 보이면 screen_view "display"가 한 번 기록된다', async () => {
    const { h } = await openApp();
    await displayLoaded();
    expect(screenViews(h.tracker)).toEqual(['display']);
  });
});

describe('전시 화면 정렬·날짜 (TC-DISP-011~014, 028~035)', () => {
  it('TC-DISP-012 정렬 탭을 누르면 기존 사진을 유지한 채 새로고침 표시를 보이다가 교체한다', async () => {
    const gate = deferred<void>();
    await openApp({ routes: { [POPULAR_P1]: gated(gate, 'display/posts-list__popular-page1') } });
    await displayLoaded();
    fireEvent.click(tid('display.sort-popular-tab'));
    expect(await screen.findByTestId('display.refresh-indicator')).toBeInTheDocument();
    expect(tid('display.sort-popular-tab')).toHaveAttribute('aria-selected', 'true');
    expect(itemIds().slice(0, 5)).toEqual(['202', '203', '204', '205', '201']); // 최신순 그대로
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByTestId('display.refresh-indicator')).not.toBeInTheDocument());
    expect(itemIds().slice(-1)).toEqual(['201']); // 인기순은 201이 맨 끝
  });

  it('랜덤순을 고르면 sort=random으로 요청하고 URL의 sort가 replace로 갱신된다(REQ-DISP-010)', async () => {
    const { fixtures, router } = await openApp();
    await displayLoaded();
    fireEvent.click(tid('display.sort-random-tab'));
    await waitFor(() => expect(fixtures.calls(postsKey(TODAY, 'random'))).toHaveLength(1));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('sort')).toBe('random'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.pathname).toBe('/display');
  });

  it('TC-DISP-013 과거 날짜는 정렬 탭을 숨기고 추천 페이저와 아카이브 설명을 보인다', async () => {
    await openApp({ path: `/display?date=${YESTERDAY}&sort=popular` });
    await displayLoaded();
    expect(tid('display.date-label')).toHaveTextContent('10월 26일');
    expect(screen.queryByTestId('display.sort-recent-tab')).not.toBeInTheDocument();
    expect(tid('display.featured-pager')).toBeInTheDocument();
    expect(tid('display.description')).toHaveTextContent(t('display.header.desc-archive'));
    for (const n of [202, 203, 204, 205, 206]) expect(screen.getByTestId(`display.featured-item-${idOf(n)}`)).toBeInTheDocument();
    expect(tid('display.next-date-button')).toBeEnabled();
  });

  it('이전·다음 날짜 버튼으로 이동하고 오늘에서는 다음이 비활성이다(TC-DISP-029)', async () => {
    await openApp();
    await displayLoaded();
    fireEvent.click(tid('display.prev-date-button'));
    await waitFor(() => expect(tid('display.date-label')).toHaveTextContent('10월 26일'));
    expect(screen.queryByTestId('display.sort-recent-tab')).not.toBeInTheDocument();
    fireEvent.click(tid('display.next-date-button'));
    await waitFor(() => expect(tid('display.date-label')).toHaveTextContent('10월 27일'));
    expect(tid('display.next-date-button')).toBeDisabled();
    expect(tid('display.sort-recent-tab')).toBeInTheDocument();
  });

  it('TC-DISP-028 최초 전시일에서는 이전 버튼이 비활성이다', async () => {
    await openApp({
      path: '/display?date=2026-09-17&sort=popular',
      routes: { [topicKey('2026-09-17')]: 'display/topics__first-date-2026-09-17', [postsKey('2026-09-17', 'popular')]: 'display/posts-list__popular-3' },
    });
    await displayLoaded();
    expect(tid('display.prev-date-button')).toBeDisabled();
    expect(tid('display.date-label')).toHaveTextContent('9월 17일');
  });

  it('TC-DISP-031 이전 날짜가 404면 토스트 "해당 날짜의 전시가 없어요"를 띄우고 보던 날짜를 유지한다', async () => {
    await openApp({ routes: { [topicKey(YESTERDAY)]: 'display/topics__404-not-found' } });
    await displayLoaded();
    fireEvent.click(tid('display.prev-date-button'));
    await waitFor(() => expect(toastText()).toBe(t('display.date-missing')));
    expect(tid('display.date-label')).toHaveTextContent('10월 27일');
    expect(screen.getByTestId(`display.item-${OTHER}`)).toBeInTheDocument();
  });

  it('TC-DISP-036 날짜 선택 시트: 연·월·일 선택값이 범위에 맞고 확인하면 그 날짜의 전시가 열린다', async () => {
    const { fixtures } = await openApp({ routes: dateRoutes('2026-10-20', 'popular', 'display/posts-list__popular-page1', '빗소리') });
    await displayLoaded();
    expect(screen.queryByTestId('display.date-picker-sheet')).not.toBeInTheDocument();
    fireEvent.click(tid('display.date-picker-button'));
    expect(await screen.findByTestId('display.date-picker-sheet')).toBeInTheDocument();
    const values = (id: string) => Array.from((tid(id) as HTMLSelectElement).options).map((o) => o.value);
    expect(values('display.date-picker-year')).toEqual(['2026']);
    expect(values('display.date-picker-month')).toEqual(['9', '10']);
    expect(values('display.date-picker-day')).toEqual(Array.from({ length: 27 }, (_, i) => String(i + 1)));
    fireEvent.change(tid('display.date-picker-month'), { target: { value: '9' } });
    expect(values('display.date-picker-day')).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 17)));
    fireEvent.change(tid('display.date-picker-month'), { target: { value: '10' } });
    fireEvent.change(tid('display.date-picker-day'), { target: { value: '20' } });
    fireEvent.click(tid('display.date-picker-confirm-button'));
    await waitFor(() => expect(tid('display.date-label')).toHaveTextContent('10월 20일'));
    expect(fixtures.calls(topicKey('2026-10-20'))).toHaveLength(1);
    expect(screen.queryByTestId('display.date-picker-sheet')).not.toBeInTheDocument();
  });

  it('TC-DISP-035 현재 날짜를 다시 선택해 확인하면 재요청하지 않는다', async () => {
    const { fixtures } = await openApp();
    await displayLoaded();
    fireEvent.click(tid('display.date-picker-button'));
    await screen.findByTestId('display.date-picker-sheet');
    fireEvent.click(tid('display.date-picker-confirm-button'));
    await waitFor(() => expect(screen.queryByTestId('display.date-picker-sheet')).not.toBeInTheDocument());
    expect(fixtures.calls(topicKey(TODAY))).toHaveLength(1);
    expect(fixtures.calls(RECENT_P1)).toHaveLength(1);
  });
});

describe('전시 화면 빈·오류 상태 (TC-DISP-005~010)', () => {
  it('TC-DISP-005 최초 로드 500이면 오류 화면이고 다시 시도하면 성공한다', async () => {
    const { fixtures, h } = await openApp({ routes: { [RECENT_P1]: 'display/posts-list__500-server-error' } });
    await advance(h, 2000); // GET 재시도 백오프(0.5초, 1초)는 가상 시간이다
    const error = await screen.findByTestId('display.error-state');
    expect(error).toHaveTextContent(t('display.error'));
    expect(tid('display.date-label')).toHaveTextContent('10월 27일');
    fixtures.set(RECENT_P1, 'display/posts-list__recent-page1');
    fireEvent.click(tid('display.retry-button'));
    await displayLoaded();
    expect(screen.queryByTestId('display.error-state')).not.toBeInTheDocument();
  });

  it('TC-DISP-005 연결 실패면 "네트워크 연결을 확인해 주세요" 오류 화면이다', async () => {
    const { h } = await openApp({ routes: { [topicKey(TODAY)]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    await advance(h, 2000);
    expect(await screen.findByTestId('display.error-state')).toHaveTextContent(t('common.error.network'));
  });

  it('TC-DISP-006 주제가 없으면 빈 상태이고 오류가 아니다', async () => {
    await openApp({ routes: { [topicKey(TODAY)]: 'display/topics__404-not-found' } });
    expect(await screen.findByTestId('display.empty-state')).toHaveTextContent(t('display.empty'));
    expect(screen.queryByTestId('display.error-state')).not.toBeInTheDocument();
    expect(tid('display.prev-date-button')).toBeEnabled(); // 날짜 이동은 가능
  });

  it('TC-DISP-010 사진이 보이는 중의 재검증 실패는 토스트만 띄우고 오류 화면으로 바꾸지 않는다', async () => {
    const { fixtures, h } = await openApp();
    await displayLoaded();
    fixtures.set(RECENT_P1, 'display/posts-list__500-server-error');
    await act(async () => fireEvent.click(screen.getByTestId('bottom-bar.tab-display')));
    await advance(h, 2000);
    await waitFor(() => expect(toastText()).toBe(t('display.error')));
    expect(screen.queryByTestId('display.error-state')).not.toBeInTheDocument();
    expect(screen.getByTestId(`display.item-${OTHER}`)).toBeInTheDocument();
    await advance(h, 2500);
    expect(toastText()).toBeNull();
  });
});

describe('전시 화면 페이징 (TC-DISP-022~026)', () => {
  it('TC-DISP-022 센티넬(끝에서 세 번째)이 보이면 다음 페이지를 1회 요청하고 로딩 표시를 보인 뒤 이어 붙인다', async () => {
    const visibility = new FakeVisibilityObserver();
    const gate = deferred<void>();
    const { fixtures } = await openApp({ visibilityObserver: visibility.factory, routes: { [RECENT_P2]: gated(gate, 'display/posts-list__recent-page2') } });
    await displayLoaded();
    const target = visibility.targets.at(-1)!;
    expect(screen.getByTestId(`display.item-${idOf(218)}`).contains(target)).toBe(true); // 20개 중 인덱스 17
    act(() => visibility.show());
    act(() => visibility.show());
    expect(await screen.findByTestId('display.load-more-indicator')).toBeInTheDocument();
    expect(fixtures.calls(RECENT_P2)).toHaveLength(1);
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.getByTestId(`display.item-${idOf(227)}`)).toBeInTheDocument());
    expect(screen.queryByTestId('display.load-more-indicator')).not.toBeInTheDocument();
    expect(itemIds()).toHaveLength(27);
  });

  it('TC-DISP-026 다음 페이지가 실패하면 토스트 후 센티넬이 다시 서고, 다시 보이면 같은 페이지를 요청한다', async () => {
    const visibility = new FakeVisibilityObserver();
    let failing = true;
    const { fixtures, h } = await openApp({
      visibilityObserver: visibility.factory,
      routes: { [RECENT_P2]: () => (failing ? loadFixture('display/posts-list__500-server-error.json').toResponse() : loadFixture('display/posts-list__recent-page2.json').toResponse()) },
    });
    await displayLoaded();
    act(() => visibility.show());
    await advance(h, 2000);
    await waitFor(() => expect(toastText()).toBe(t('display.error')));
    expect(itemIds()).toHaveLength(20);
    failing = false;
    const before = fixtures.calls(RECENT_P2).length;
    act(() => visibility.show());
    await waitFor(() => expect(itemIds()).toHaveLength(27));
    expect(fixtures.calls(RECENT_P2).length - before).toBe(1);
  });

  it('TC-DISP-023 다음 페이지가 없으면(hasNext=false) 센티넬이 닿아도 요청이 없다', async () => {
    const visibility = new FakeVisibilityObserver();
    const { fixtures } = await openApp({ visibilityObserver: visibility.factory });
    await displayLoaded();
    act(() => visibility.show());
    await waitFor(() => expect(itemIds()).toHaveLength(27));
    act(() => visibility.show());
    await act(async () => undefined);
    expect(fixtures.calls(RECENT_P2)).toHaveLength(1);
  });
});

describe('전시 화면 좋아요 (D-04, TC-LIKE-003, 004, 009, 014, 030)', () => {
  it('TC-LIKE-003 하트를 누르면 서버 응답 전에 aria-pressed와 개수가 바뀐다', async () => {
    const { fixtures } = await openApp();
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await displayLoaded();
    fireEvent.click(tid(`display.like-button-${OTHER}`));
    await waitFor(() => expect(pressed(`display.like-button-${OTHER}`)).toBe('true'));
    expect(tid(`display.like-count-${OTHER}`)).toHaveTextContent('39');
    expect(tid(`display.like-button-${OTHER}`)).toHaveAccessibleName('좋아요 39개');
    await act(async () => server.succeed());
    expect(pressed(`display.like-button-${OTHER}`)).toBe('true');
    expect(server.methods).toEqual(['PUT']);
  });

  it('TC-LIKE-009 실패하면 되돌리고 토스트가 2.5초 동안 보인다', async () => {
    const { fixtures, h } = await openApp();
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await displayLoaded();
    fireEvent.click(tid(`display.like-button-${OTHER}`));
    await waitFor(() => expect(server.inFlight).toBe(1));
    await act(async () => server.invalid());
    await waitFor(() => expect(pressed(`display.like-button-${OTHER}`)).toBe('false'));
    expect(tid(`display.like-count-${OTHER}`)).toHaveTextContent('38');
    expect(toastText()).toBe(t('like.error.generic'));
    await advance(h, 2499);
    expect(toastText()).toBe(t('like.error.generic'));
    await advance(h, 1);
    expect(toastText()).toBeNull();
  });

  it('TC-LIKE-004 아카이브의 추천 카드 하트와 그리드 하트는 같은 값이다', async () => {
    const { fixtures } = await openApp({ path: `/display?date=${YESTERDAY}&sort=popular` });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await displayLoaded();
    fireEvent.click(tid(`display.featured-like-button-${OTHER}`));
    await waitFor(() => expect(pressed(`display.featured-like-button-${OTHER}`)).toBe('true'));
    expect(pressed(`display.like-button-${OTHER}`)).toBe('true');
    expect(tid(`display.featured-like-count-${OTHER}`)).toHaveTextContent('39');
    expect(tid(`display.like-count-${OTHER}`)).toHaveTextContent('39');
    await act(async () => server.succeed());
  });
});

describe('전시 화면 게스트 (D-05, TC-DISP-053, 054, TC-LIKE-014)', () => {
  it('TC-DISP-053 게스트도 목록을 보고 Authorization 없이 요청하며 모든 하트가 꺼져 있다', async () => {
    const { h } = await openApp({ mode: 'guest' });
    await displayLoaded();
    expect(h.ff.calls.filter((c) => c.path === '/topics' || c.path === '/posts').every((c) => c.headers['authorization'] === undefined)).toBe(true);
    expect(screen.getAllByTestId(/^display\.like-button-/).every((el) => el.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('TC-DISP-054 게스트가 사진을 누르면 토스트가 뜨고 이동·요청이 없다', async () => {
    const { h, router } = await openApp({ mode: 'guest' });
    await displayLoaded();
    const calls = h.ff.calls.length;
    fireEvent.click(tid(`display.item-${OTHER}`));
    await waitFor(() => expect(toastText()).toBe(t('nav.guest.feed')));
    expect(router.state.location.pathname).toBe('/display');
    expect(h.ff.calls).toHaveLength(calls);
  });

  it('TC-LIKE-014 게스트가 하트를 누르면 토스트가 뜨고 상태·요청이 그대로다', async () => {
    const { h } = await openApp({ mode: 'guest' });
    await displayLoaded();
    const calls = h.ff.calls.length;
    fireEvent.click(tid(`display.like-button-${OTHER}`));
    await waitFor(() => expect(toastText()).toBe(t('nav.guest.like')));
    expect(pressed(`display.like-button-${OTHER}`)).toBe('false');
    expect(h.ff.calls).toHaveLength(calls);
  });
});

describe('전시 화면 상세 이동·복귀 (TC-DISP-055, TC-FEED-015, REQ-NAV 스크롤)', () => {
  it('TC-DISP-055 사진을 누르면 /feed/{id}로 push하고 목록의 값을 시드로 넘긴다', async () => {
    const { router } = await openApp();
    await displayLoaded();
    fireEvent.click(tid(`display.item-${OTHER}`));
    await screen.findByTestId('feed.root');
    expect(router.state.location.pathname).toBe(`/feed/${OTHER}`);
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.state).toMatchObject({ seed: { id: OTHER, likeCount: 38, isLiked: false, title: '은행잎' } });
  });

  it('TC-FEED-015 상세에서 뒤로 가면 보던 정렬·스크롤 위치가 유지되고 처음부터 다시 로딩하지 않는다', async () => {
    const scroll = stubScroll();
    const { router, fixtures } = await openApp();
    await displayLoaded();
    fireEvent.click(tid('display.sort-popular-tab'));
    await waitFor(() => expect(fixtures.calls(POPULAR_P1)).toHaveLength(1));
    await waitFor(() => expect(itemIds().slice(-1)).toEqual(['201']));
    scroll.set(480);
    fireEvent.click(tid(`display.item-${OTHER}`));
    await screen.findByTestId('feed.root');
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByTestId('display.grid');
    expect(screen.queryByTestId('display.loading')).not.toBeInTheDocument();
    expect(tid('display.sort-popular-tab')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(scroll.tops()).toContain(480));
  });

  it('상세의 닫기 버튼으로 돌아와도 같은 위치로 복원된다', async () => {
    const scroll = stubScroll();
    await openApp();
    await displayLoaded();
    scroll.set(300);
    fireEvent.click(tid(`display.item-${OTHER}`));
    await screen.findByTestId('feed.root');
    fireEvent.click(await screen.findByTestId('feed.back-button'));
    await screen.findByTestId('display.grid');
    await waitFor(() => expect(scroll.tops()).toContain(300));
  });
});

describe('전시 탭 재선택·계정 전환 (TC-DISP-029, 044, 049)', () => {
  it('TC-DISP-029 전시 탭을 다시 누르면 맨 위로 스크롤하고 첫 페이지를 조용히 재검증한다', async () => {
    const scroll = stubScroll();
    const { fixtures } = await openApp();
    await displayLoaded();
    scroll.set(900);
    await act(async () => fireEvent.click(screen.getByTestId('bottom-bar.tab-display')));
    await waitFor(() => expect(scroll.tops()).toContain(0));
    await waitFor(() => expect(fixtures.calls(RECENT_P1)).toHaveLength(2));
    expect(screen.queryByTestId('display.loading')).not.toBeInTheDocument();
    expect(screen.getByTestId(`display.item-${OTHER}`)).toBeInTheDocument();
  });

  it('TC-DISP-049 계정이 바뀌면(UserCaches 비움) 이전 계정의 좋아요 표시가 남지 않는다', async () => {
    const { h, fixtures } = await openApp();
    await displayLoaded();
    expect(pressed(`display.like-button-${idOf(203)}`)).toBe('true');
    fixtures.set(RECENT_P1, 'display/posts-list__guest-page1');
    await act(async () => h.container.userCaches.clearAll());
    await waitFor(() => expect(pressed(`display.like-button-${idOf(203)}`)).toBe('false'));
  });
});
