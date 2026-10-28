import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { networkFailure } from '../../test/fakeFetch';
import { deferred } from '../../test/deferred';
import { FixtureRouter } from '../../test/fixtureRouter';
import type { RouteValue } from '../../test/fixtureRouter';
import { loadFixture, guestSession, memberSession } from '../../test/fixtures';
import { makeHarness, renderApp } from '../../test/appHarness';
import type { Harness } from '../../test/appHarness';
import { screenViews } from '../../test/screenViews';
import {
  BANNERS_P1,
  CALENDAR_OCT,
  GUEST_ROUTES,
  MEMBER_ROUTES,
  MY_POST_ID,
  POPULAR_TODAY,
  POPULAR_YESTERDAY,
  TODAY_POST,
  TOPICS_TODAY,
  UNREAD,
} from '../../test/homeHarness';

/** Web 새로고침 버튼의 접근성 이름. copy 키와 testids 표에 아직 없어 임시로 둔다(보고서 참고). */
const REFRESH_BUTTON_NAME = '새로고침';
const AI_GET = `GET /posts/${MY_POST_ID}/ai-review`;
const AI_POST = `POST /posts/${MY_POST_ID}/ai-review`;
const WEEKDAYS = t('record.weekday');

interface OpenOptions {
  mode?: 'member' | 'guest';
  routes?: Record<string, RouteValue>;
  strict?: boolean;
  path?: string;
}

async function openHome(options: OpenOptions = {}) {
  const mode = options.mode ?? 'member';
  const h = makeHarness({ session: mode === 'member' ? memberSession() : guestSession });
  const fixtures = new FixtureRouter(h.ff, { ...(mode === 'member' ? MEMBER_ROUTES : GUEST_ROUTES), ...options.routes });
  const view = renderApp(h.container, options.path ?? '/home', { strict: options.strict });
  await screen.findByTestId('home.root');
  return { h, fixtures, ...view };
}

/** 첫 로드가 끝날 때까지(히어로가 로딩을 벗어날 때까지) 기다린다. */
async function loaded() {
  await waitFor(() => expect(screen.queryByTestId('home.hero-loading')).not.toBeInTheDocument());
}

const advance = async (h: Harness, ms: number) => {
  await act(async () => {
    await h.clock.advance(ms);
  });
};
const toastText = () => screen.queryByTestId('toast.message')?.textContent ?? null;
const id = (n: string) => `22222222-2222-4222-8222-222222222${n}`;

describe('홈 화면 머리글 (REQ-HOME-004, 005)', () => {
  it('TC-HOME-001 REQ-HOME-007 /posts/today 응답 전 히어로는 "오늘의 주제를 불러오는 중"이고 다른 섹션은 기다리지 않는다', async () => {
    const gate = deferred<void>();
    const { h } = await openHome({
      routes: {
        [TODAY_POST]: async () => {
          await gate.promise;
          return loadFixture('home/posts-today__posted-approved.json').toResponse();
        },
      },
    });
    expect(await screen.findByTestId('home.hero-loading')).toHaveTextContent(t('home.topic.loading'));
    await screen.findByTestId(`home.popular-item-${id('202')}`);
    expect(screen.getByTestId('home.ranking-section')).toBeInTheDocument();
    expect(screen.getByTestId('home.week-section')).toBeInTheDocument();
    await act(async () => gate.resolve());
    expect(await screen.findByTestId('home.hero-photo')).toBeInTheDocument();
    expect(screen.queryByTestId('home.hero-loading')).not.toBeInTheDocument();
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(1);
  });

  it('TC-HOME-053 REQ-HOME-004 날짜 라벨은 "10월 27일 · 오늘의 주제"이고 제목이 보인다(기기 시간대와 무관한 KST)', async () => {
    await openHome();
    expect(await screen.findByText('가을 하늘')).toBeInTheDocument();
    expect(screen.getByTestId('home.topic-date')).toHaveTextContent('10월 27일 · 오늘의 주제');
    expect(screen.getByTestId('home.topic-title')).toHaveTextContent('가을 하늘');
  });

  it('TC-HOME-018 REQ-HOME-005 주제 404는 "오늘의 주제가 아직 준비되지 않았어요"이고 오류 문구와 구분되며 오늘 인기는 빈 상태다', async () => {
    await openHome({ routes: { [TOPICS_TODAY]: 'home/topics__404-not-found' } });
    await loaded();
    await waitFor(() => expect(screen.getByTestId('home.topic-title')).toHaveTextContent(t('home.topic.not-ready')));
    expect(screen.queryByText(t('home.topic.error'))).not.toBeInTheDocument();
    expect(screen.queryByTestId('home.retry-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('home.popular-empty')).toHaveTextContent(t('home.ranking.empty'));
  });

  it('REQ-HOME-005 주제 조회 실패는 "오늘의 주제를 불러오지 못했어요" + 다시 시도이고 누르면 다시 불러온다', async () => {
    const { h } = await openHome({ routes: { [TOPICS_TODAY]: 'home/posts-list__500-server-error' } });
    await advance(h, 5_000);
    await waitFor(() => expect(screen.getByTestId('home.topic-title')).toHaveTextContent(t('home.topic.error')));
    new FixtureRouter(h.ff).set(TOPICS_TODAY, 'home/topics__open-2026-10-27');
    fireEvent.click(screen.getByTestId('home.retry-button'));
    expect(await screen.findByText('가을 하늘')).toBeInTheDocument();
    expect(screen.queryByTestId('home.retry-button')).not.toBeInTheDocument();
  });
});

describe('홈 히어로 7상태 (D-06)', () => {
  it('TC-HOME-002 NoOpenTopic: 문구만 있고 다시 시도 버튼과 오류 요소가 없다', async () => {
    await openHome({ routes: { [TODAY_POST]: 'home/posts-today__404-no-open-topic' } });
    expect(await screen.findByTestId('home.hero-no-open-topic')).toHaveTextContent(t('home.hero.no-open-topic'));
    expect(screen.queryByTestId('home.hero-retry-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home.hero-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home.hero-upload-button')).not.toBeInTheDocument();
  });

  it('TC-HOME-003 Empty: "\\"가을 하늘\\" 사진을 공유하지 않았어요"와 업로드 진입 버튼이고 누르면 UploadEntry가 시작된다', async () => {
    const { h } = await openHome({ routes: { [TODAY_POST]: 'home/posts-today__not-posted' } });
    const empty = await screen.findByTestId('home.hero-empty');
    expect(empty).toHaveTextContent(t('home.hero.empty', { 주제: '가을 하늘' }));
    expect(h.upload.starts).toBe(0);
    fireEvent.click(screen.getByTestId('home.hero-upload-button'));
    expect(h.upload.starts).toBe(1);
  });

  it('TC-HOME-004 Processing: "사진을 처리하고 있어요"만 보이고 사진·배지가 없다', async () => {
    await openHome({ routes: { [TODAY_POST]: 'home/posts-today__posted-validating', [CALENDAR_OCT]: 'home/posts-calendar__2026-10-empty' } });
    expect(await screen.findByTestId('home.hero-processing')).toHaveTextContent(t('home.hero.processing'));
    expect(screen.queryByTestId('home.hero-photo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home.hero-pending-badge')).not.toBeInTheDocument();
  });

  it('TC-HOME-005 PENDING: 사진 + "검수 대기" 배지, 썸네일은 이번 주 기록의 같은 postId에서 온다', async () => {
    await openHome({ routes: { [TODAY_POST]: 'home/posts-today__posted-pending', [CALENDAR_OCT]: 'home/posts-calendar__2026-10-week-pending' } });
    const photo = await screen.findByTestId('home.hero-photo');
    expect(screen.getByTestId('home.hero-pending-badge')).toHaveTextContent(t('home.hero.pending-badge'));
    expect(photo.querySelector('img')).toHaveAttribute('src', `https://cdn.example.test/posts/${MY_POST_ID}/thumbnail.webp`);
  });

  it('TC-HOME-006 APPROVED: 배지 없는 사진이고 눌러도 이동하지 않는다(확인 필요 항목, 임시 동작)', async () => {
    const { path } = await openHome();
    const photo = await screen.findByTestId('home.hero-photo');
    expect(screen.queryByTestId('home.hero-pending-badge')).not.toBeInTheDocument();
    fireEvent.click(photo);
    expect(path()).toBe('/home');
    expect(screen.queryByTestId('toast.message')).not.toBeInTheDocument();
  });

  it('TC-HOME-007 달력 조회가 실패해도 히어로는 사진 상태 그대로이고(대체 이미지) 주간 기록만 오류다', async () => {
    const { h } = await openHome({ routes: { [CALENDAR_OCT]: 'home/posts-calendar__500-server-error' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.hero-photo')).toBeInTheDocument();
    expect(screen.queryByTestId('home.hero-error')).not.toBeInTheDocument();
    expect(await screen.findByTestId('home.week-error')).toHaveTextContent(t('home.weekly.error'));
  });

  it('TC-HOME-008 REQ-HOME-014 정지 회원: Empty 모양이고 업로드 진입을 누르면 정지 안내 토스트만 뜨고 UploadEntry는 시작되지 않는다', async () => {
    const { h } = await openHome({ routes: { [TODAY_POST]: 'home/posts-today__403-banned' } });
    expect(await screen.findByTestId('home.hero-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('home.hero-upload-button'));
    expect(toastText()).toBe(t('home.hero.banned'));
    expect(h.upload.starts).toBe(0);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(1);
  });

  it('TC-HOME-009 Error: "사진 상태를 불러오지 못했어요" + 다시 시도, 누르면 /posts/today 1회 재요청 후 성공 상태가 된다', async () => {
    const { h } = await openHome({ routes: { [TODAY_POST]: 'home/posts-today__500-server-error' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.hero-error')).toHaveTextContent(t('home.hero.error'));
    const router = new FixtureRouter(h.ff);
    router.set(TODAY_POST, 'home/posts-today__posted-approved');
    fireEvent.click(screen.getByTestId('home.hero-retry-button'));
    expect(await screen.findByTestId('home.hero-photo')).toBeInTheDocument();
    expect(router.calls(TODAY_POST)).toHaveLength(1);
    expect(screen.queryByTestId('home.hero-error')).not.toBeInTheDocument();
  });

  it('TC-HOME-010 반려 뒤 isPosted=false: Empty이고 오류 문구가 뜨지 않는다', async () => {
    await openHome({ routes: { [TODAY_POST]: 'home/posts-today__not-posted-after-reject' } });
    expect(await screen.findByTestId('home.hero-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('home.hero-error')).not.toBeInTheDocument();
  });

  it('TC-HOME-011 알 수 없는 moderationStatus는 Error + 다시 시도다', async () => {
    const { h } = await openHome({ routes: { [TODAY_POST]: 'home/posts-today__unknown-status' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.hero-error')).toBeInTheDocument();
    expect(screen.getByTestId('home.hero-retry-button')).toBeInTheDocument();
  });

  it('상태 요소는 숨기지 않고 DOM에서 뺀다: 한 번에 히어로 상태 요소는 하나뿐이다', async () => {
    await openHome();
    await screen.findByTestId('home.hero-photo');
    for (const other of ['home.hero-loading', 'home.hero-no-open-topic', 'home.hero-empty', 'home.hero-processing', 'home.hero-error']) {
      expect(screen.queryByTestId(other)).not.toBeInTheDocument();
    }
  });
});

describe('홈 이번 주 기록 (REQ-HOME-019~026)', () => {
  it('TC-HOME-024 REQ-HOME-022 일~토 7칸(home.week-day-{날짜})과 요일 머리글이 순서대로 있다', async () => {
    await openHome();
    const section = await screen.findByTestId('home.week-section');
    expect(section).toHaveTextContent(t('home.weekly.title'));
    const days = within(section)
      .getAllByTestId(/^home\.week-day-/)
      .map((el) => el.getAttribute('data-testid'));
    expect(days).toEqual(['25', '26', '27', '28', '29', '30', '31'].map((d) => `home.week-day-2026-10-${d}`));
    for (const label of WEEKDAYS) expect(section).toHaveTextContent(label);
  });

  it('TC-HOME-030 REQ-HOME-021 기록이 있는 날만 사진(home.week-photo-{날짜})이 있고 머리글에 N/7이 보인다', async () => {
    await openHome();
    await screen.findByTestId('home.week-section');
    expect(screen.getByTestId('home.week-count')).toHaveTextContent('3/7');
    for (const d of ['25', '26', '27']) expect(screen.getByTestId(`home.week-photo-2026-10-${d}`)).toBeInTheDocument();
    for (const d of ['28', '29', '30', '31']) expect(screen.queryByTestId(`home.week-photo-2026-10-${d}`)).not.toBeInTheDocument();
  });

  it('REQ-HOME-022 PENDING 칸에는 "대기" 라벨이 붙고 APPROVED 칸에는 없다', async () => {
    await openHome({ routes: { [CALENDAR_OCT]: 'home/posts-calendar__2026-10-week-pending' } });
    await screen.findByTestId('home.week-section');
    expect(screen.getByTestId('home.week-day-2026-10-27')).toHaveTextContent(t('home.weekly.pending'));
    expect(screen.getByTestId('home.week-day-2026-10-26')).not.toHaveTextContent(t('home.weekly.pending'));
  });

  it('TC-HOME-031 REQ-HOME-023 기록이 있는 칸을 누르면 기록 탭이 그 날짜로 열리고 뒤로 가면 홈이다. 기록이 없는 칸은 아무 일도 없다', async () => {
    const { router, path } = await openHome();
    await screen.findByTestId('home.week-section');
    fireEvent.click(screen.getByTestId('home.week-day-2026-10-29'));
    expect(path()).toBe('/home');

    fireEvent.click(screen.getByTestId('home.week-day-2026-10-26'));
    await screen.findByTestId('record.root');
    expect(path()).toBe('/record');
    expect(router.state.location.search).toBe('?date=2026-10-26');
    expect(router.state.location.state).toMatchObject({ homeBelow: true });

    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
  });

  it('REQ-HOME-024 보러가기는 기록 탭으로 이동한다', async () => {
    const { router, path } = await openHome();
    await screen.findByTestId('home.week-section');
    fireEvent.click(screen.getByText(t('home.weekly.more')));
    await screen.findByTestId('record.root');
    expect(path()).toBe('/record');
    expect(router.state.location.search).toBe('');
  });

  it('TC-HOME-032 REQ-HOME-025 주간 조회 실패는 이 섹션만 "기록을 불러오지 못했어요" + 다시 시도이고, 다시 시도는 주간만 다시 부른다', async () => {
    const { h } = await openHome({ routes: { [CALENDAR_OCT]: 'home/posts-calendar__500-server-error' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.week-error')).toHaveTextContent(t('home.weekly.error'));
    expect(screen.getByTestId(`home.popular-item-${id('202')}`)).toBeInTheDocument();
    expect(screen.queryByTestId('home.week-count')).not.toBeInTheDocument();

    const router = new FixtureRouter(h.ff);
    router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-approved');
    const before = h.ff.calls.length;
    fireEvent.click(screen.getByTestId('home.week-retry-button'));
    expect(await screen.findByTestId('home.week-count')).toHaveTextContent('3/7');
    expect(h.ff.calls.length - before).toBe(1);
    expect(screen.queryByTestId('home.week-error')).not.toBeInTheDocument();
  });

  it('REQ-HOME-026 TC-HOME-012 게스트의 7칸은 모두 빈 칸이고(0/7) 사진이 없다', async () => {
    await openHome({ mode: 'guest' });
    await screen.findByTestId('home.week-section');
    expect(screen.getAllByTestId(/^home\.week-day-/)).toHaveLength(7);
    expect(screen.queryAllByTestId(/^home\.week-photo-/)).toHaveLength(0);
    expect(screen.getByTestId('home.week-count')).toHaveTextContent('0/7');
  });
});

describe('홈 어제 랭킹·오늘 인기 (REQ-HOME-027~032)', () => {
  it('TC-HOME-015 TC-HOME-016 오늘 인기는 앞 5개, 어제 랭킹은 있는 만큼(3개)이다', async () => {
    await openHome();
    await screen.findByTestId(`home.popular-item-${id('202')}`);
    expect(screen.getAllByTestId(/^home\.popular-item-/).map((el) => el.getAttribute('data-testid'))).toEqual(['202', '203', '204', '205', '206'].map((n) => `home.popular-item-${id(n)}`));
    expect(screen.getAllByTestId(/^home\.ranking-item-/).map((el) => el.getAttribute('data-testid'))).toEqual(['261', '262', '263'].map((n) => `home.ranking-item-${id(n)}`));
    expect(screen.getByTestId('home.ranking-section')).toHaveTextContent(t('home.ranking.yesterday-title'));
    expect(screen.getByTestId('home.popular-section')).toHaveTextContent(t('home.ranking.today-title'));
  });

  it('TC-HOME-017 어제 주제 404면 어제 랭킹만 "아직 올라온 사진이 없어요"이고 다른 섹션은 정상이다', async () => {
    await openHome({ routes: { 'GET /topics?date=2026-10-26': 'home/topics__404-not-found' } });
    expect(await screen.findByTestId('home.ranking-empty')).toHaveTextContent(t('home.ranking.empty'));
    expect(screen.queryAllByTestId(/^home\.ranking-item-/)).toHaveLength(0);
    expect(await screen.findByTestId('home.hero-photo')).toBeInTheDocument();
    expect(screen.queryByTestId('home.popular-empty')).not.toBeInTheDocument();
  });

  it.each([
    ['home/posts-list__popular-0', 0],
    ['home/posts-list__popular-1', 1],
  ])('TC-HOME-019 오늘 인기 %s: %i개만 그리고 0개면 빈 상태 문구를 보인다', async (fixture, count) => {
    await openHome({ routes: { [POPULAR_TODAY]: fixture } });
    await loaded();
    await waitFor(() => expect(screen.queryAllByTestId(/^home\.popular-item-/)).toHaveLength(count));
    if (count === 0) expect(screen.getByTestId('home.popular-empty')).toHaveTextContent(t('home.ranking.empty'));
    else expect(screen.queryByTestId('home.popular-empty')).not.toBeInTheDocument();
  });

  it('TC-HOME-020 REQ-HOME-030 어제 랭킹만 실패하면 "어제 랭킹 사진을 불러오지 못했어요" + 다시 시도이고 다른 섹션은 유지된다', async () => {
    const { h } = await openHome({ routes: { [POPULAR_YESTERDAY]: 'home/posts-list__500-server-error' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.ranking-error')).toHaveTextContent(t('home.ranking.error', { '섹션 제목': t('home.ranking.yesterday-title') }));
    expect(screen.getByTestId(`home.popular-item-${id('202')}`)).toBeInTheDocument();
    expect(screen.getByTestId('home.hero-photo')).toBeInTheDocument();

    new FixtureRouter(h.ff).set(POPULAR_YESTERDAY, 'home/posts-list__popular-3');
    fireEvent.click(screen.getByTestId('home.ranking-retry-button'));
    expect(await screen.findByTestId(`home.ranking-item-${id('261')}`)).toBeInTheDocument();
    expect(screen.queryByTestId('home.ranking-error')).not.toBeInTheDocument();
  });

  it('TC-HOME-020 오늘 인기만 실패하면 "오늘 인기있는 사진 사진을 불러오지 못했어요" + 다시 시도(home.popular-*)다', async () => {
    const { h } = await openHome({ routes: { [POPULAR_TODAY]: 'home/posts-list__500-server-error' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.popular-error')).toHaveTextContent(t('home.ranking.error', { '섹션 제목': t('home.ranking.today-title') }));
    new FixtureRouter(h.ff).set(POPULAR_TODAY, 'home/posts-list__popular-8');
    fireEvent.click(screen.getByTestId('home.popular-retry-button'));
    expect(await screen.findByTestId(`home.popular-item-${id('202')}`)).toBeInTheDocument();
  });

  it('TC-HOME-021 REQ-HOME-032 랭킹 사진을 누르면 /feed/{postId}로 가고 목록 항목이 시드로 넘어간다. 상세 API는 홈이 부르지 않는다', async () => {
    const { h, router, path } = await openHome();
    fireEvent.click(await screen.findByTestId(`home.popular-item-${id('203')}`));
    await screen.findByTestId('feed.root');
    expect(path()).toBe(`/feed/${id('203')}`);
    expect(router.state.location.state).toMatchObject({ seed: { id: id('203'), likeCount: 37, isLiked: true } });
    expect(h.ff.calls.some((c) => c.path === `/posts/${id('203')}`)).toBe(false);
  });

  it('TC-HOME-022 REQ-HOME-032 게스트가 랭킹 사진을 누르면 토스트만 뜨고 이동·상세 요청이 없다', async () => {
    const { h, path } = await openHome({ mode: 'guest' });
    fireEvent.click(await screen.findByTestId(`home.popular-item-${id('202')}`));
    expect(toastText()).toBe(t('home.guest.feed'));
    expect(path()).toBe('/home');
    expect(h.ff.calls.some((c) => /^\/posts\/[0-9a-f-]{36}$/.test(c.path))).toBe(false);
  });

  it('TC-HOME-023 REQ-HOME-031 더 보기는 전시 탭을 해당 날짜의 인기순으로 연다(어제 / 오늘)', async () => {
    const { router, path } = await openHome();
    fireEvent.click(await screen.findByTestId('home.ranking-more-link'));
    await screen.findByTestId('display.root');
    expect(path()).toBe('/display');
    expect(router.state.location.search).toBe('?date=2026-10-26&sort=popular');
    expect(router.state.location.state).toMatchObject({ homeBelow: true });

    await act(async () => {
      await router.navigate(-1);
    });
    fireEvent.click(await screen.findByTestId('home.popular-more-link'));
    await screen.findByTestId('display.root');
    expect(router.state.location.search).toBe('?date=2026-10-27&sort=popular');
  });

  it('게스트도 더 보기로 전시 탭에 들어갈 수 있다(전시는 게스트 허용, D-05)', async () => {
    const { path, router } = await openHome({ mode: 'guest' });
    fireEvent.click(await screen.findByTestId('home.popular-more-link'));
    await screen.findByTestId('display.root');
    expect(path()).toBe('/display');
    expect(router.state.location.search).toBe('?date=2026-10-27&sort=popular');
    expect(toastText()).toBeNull();
  });
});

describe('홈 AI 피드백 카드 (REQ-HOME-034, 035)', () => {
  it('TC-HOME-054 오늘 승인된 내 사진이면 카드가 보이고 NONE은 요청 버튼이다', async () => {
    await openHome();
    const card = await screen.findByTestId('home.ai-card');
    expect(within(card).getByTestId('home.ai-request-button')).toHaveTextContent(t('ai.card.request'));
    for (const other of ['home.ai-processing', 'home.ai-completed', 'home.ai-failed']) expect(screen.queryByTestId(other)).not.toBeInTheDocument();
  });

  it.each([
    ['PENDING', 'home/posts-today__posted-pending'],
    ['VALIDATING', 'home/posts-today__posted-validating'],
    ['Empty', 'home/posts-today__not-posted'],
    ['NoOpenTopic', 'home/posts-today__404-no-open-topic'],
  ])('TC-HOME-054 히어로가 %s이면 카드가 없고 ai-review 요청도 0건이다', async (_name, fixture) => {
    const { h } = await openHome({ routes: { [TODAY_POST]: fixture } });
    await loaded();
    await act(async () => {
      await h.clock.advance(0);
    });
    expect(screen.queryByTestId('home.ai-card')).not.toBeInTheDocument();
    expect(h.ff.calls.filter((c) => c.path.endsWith('/ai-review'))).toHaveLength(0);
  });

  it('TC-HOME-054 게스트는 카드도 ai-review 요청도 없다', async () => {
    const { h } = await openHome({ mode: 'guest' });
    await loaded();
    expect(screen.queryByTestId('home.ai-card')).not.toBeInTheDocument();
    expect(h.ff.calls.filter((c) => c.path.endsWith('/ai-review'))).toHaveLength(0);
  });

  it('REQ-HOME-035 PROCESSING은 진행 중 문구, COMPLETED는 완료 문구 + 자세히 보기, FAILED는 실패 문구 + 재요청이다', async () => {
    await openHome({ routes: { [AI_GET]: 'ai-review/ai-review-get__processing' } });
    expect(await screen.findByTestId('home.ai-processing')).toHaveTextContent(t('ai.card.processing'));
    expect(screen.queryByTestId('home.ai-request-button')).not.toBeInTheDocument();
  });

  it('REQ-HOME-035 COMPLETED: 완료 문구와 자세히 보기 버튼이고 누르면 게시물 상세(AI 시트 자동 열기 state)로 간다', async () => {
    const { router, path } = await openHome({ routes: { [AI_GET]: 'ai-review/ai-review-get__completed' } });
    expect(await screen.findByTestId('home.ai-completed')).toHaveTextContent(t('ai.card.completed'));
    fireEvent.click(screen.getByTestId('home.ai-detail-button'));
    await screen.findByTestId('feed.root');
    expect(path()).toBe(`/feed/${MY_POST_ID}`);
    expect(router.state.location.state).toMatchObject({ openAiReview: true });
  });

  it('REQ-HOME-035 FAILED: canRequestAgain이면 재요청 버튼이 있고 아니면 없다', async () => {
    await openHome({ routes: { [AI_GET]: 'ai-review/ai-review-get__failed-can-retry' } });
    expect(await screen.findByTestId('home.ai-failed')).toHaveTextContent(t('ai.card.failed'));
    expect(screen.getByTestId('home.ai-retry-button')).toHaveTextContent(t('ai.card.retry'));
  });

  it('REQ-HOME-035 FAILED + canRequestAgain=false면 재요청 버튼이 없다', async () => {
    await openHome({ routes: { [AI_GET]: 'ai-review/ai-review-get__failed-cannot-retry' } });
    expect(await screen.findByTestId('home.ai-failed')).toBeInTheDocument();
    expect(screen.queryByTestId('home.ai-retry-button')).not.toBeInTheDocument();
  });

  it('REQ-HOME-035 ai-review가 404면 카드가 숨겨진다', async () => {
    await openHome({ routes: { [AI_GET]: 'ai-review/ai-review-get__404-not-found' } });
    await screen.findByTestId('home.hero-photo');
    await waitFor(() => expect(screen.queryByTestId('home.ai-card')).not.toBeInTheDocument());
  });

  it('TC-HOME-054 요청 버튼은 POST /ai-review를 1회 보내고 진행 중 카드로 바뀐다', async () => {
    const { fixtures } = await openHome({ routes: { [AI_POST]: 'ai-review/ai-review-post__202-processing' } });
    fireEvent.click(await screen.findByTestId('home.ai-request-button'));
    expect(await screen.findByTestId('home.ai-processing')).toBeInTheDocument();
    expect(fixtures.calls(AI_POST)).toHaveLength(1);
  });

  it('D-08 요청이 403이면 정지 안내 토스트가 뜨고 요청 버튼이 그대로 남는다', async () => {
    await openHome({ routes: { [AI_POST]: 'ai-review/ai-review-post__403-banned' } });
    fireEvent.click(await screen.findByTestId('home.ai-request-button'));
    await waitFor(() => expect(toastText()).toBe(t('ai.error.banned')));
    expect(screen.getByTestId('home.ai-request-button')).toBeInTheDocument();
  });
});

describe('홈 ISSUE 배너 (BANR)', () => {
  it('TC-BANR-004 REQ-BANR-004 배너 카드마다 home.issue-item-{bannerId}가 있고 제목·부제목이 접근성 이름으로 읽힌다', async () => {
    await openHome();
    const section = await screen.findByTestId('home.issue-section');
    expect(section).toHaveTextContent(t('home.banner.title'));
    const items = within(section).getAllByTestId(/^home\.issue-item-/);
    expect(items).toHaveLength(10);
    expect(items[0]).toHaveAttribute('data-testid', 'home.issue-item-44444444-4444-4444-8444-444444444401');
    expect(items[0]).toHaveTextContent('이슈 1');
    expect(items[0]).toHaveTextContent('찰칵 소식 1');
    expect(items[0]).toHaveAccessibleName(/이슈 1.*찰칵 소식 1/);
    expect(screen.queryByTestId('home.issue-error')).not.toBeInTheDocument();
  });

  it('TC-BANR-012 REQ-BANR-012 배너를 누르면 https 주소를 새 탭(ExternalLinkOpener)으로 열고 홈은 그대로이며 issue screen_view는 없다', async () => {
    const { h, path } = await openHome();
    fireEvent.click(await screen.findByTestId('home.issue-item-44444444-4444-4444-8444-444444444402'));
    expect(h.opener.opened).toEqual(['https://web.example.test/issues/2']);
    expect(path()).toBe('/home');
    expect(screenViews(h.tracker)).toEqual(['home']); // Web은 앱 안 웹뷰 화면이 없다(허용 차이)
  });

  it('TC-BANR-023 새 탭을 열지 못하면 "브라우저에서 링크를 열지 못했어요" 토스트가 뜬다', async () => {
    const { h } = await openHome();
    h.opener.result = false;
    fireEvent.click(await screen.findByTestId('home.issue-item-44444444-4444-4444-8444-444444444401'));
    expect(toastText()).toBe(t('banner.web.open-failed'));
  });

  it('TC-BANR-010 REQ-BANR-005 빈 응답이면 ISSUE 섹션도 오류도 보이지 않는다', async () => {
    await openHome({ routes: { [BANNERS_P1]: 'banner/banners__empty' } });
    await loaded();
    await waitFor(() => expect(screen.queryByTestId('home.issue-section')).not.toBeInTheDocument());
    expect(screen.queryByTestId('home.issue-error')).not.toBeInTheDocument();
  });

  it('TC-BANR-010 REQ-BANR-006 최초 조회 실패는 "ISSUE를 불러오지 못했어요. 다시 시도"(home.issue-error)이고 섹션은 없으며 다른 섹션은 영향이 없다. 다시 시도하면 목록이 뜬다', async () => {
    const { h } = await openHome({ routes: { [BANNERS_P1]: 'banner/banners__500-server-error' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.issue-error')).toHaveTextContent(t('home.banner.error'));
    expect(screen.queryByTestId('home.issue-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('home.hero-photo')).toBeInTheDocument();
    expect(screen.getByTestId(`home.popular-item-${id('202')}`)).toBeInTheDocument();

    new FixtureRouter(h.ff).set(BANNERS_P1, 'banner/banners__page1-10');
    fireEvent.click(screen.getByTestId('home.issue-retry-button'));
    expect(await screen.findByTestId('home.issue-section')).toBeInTheDocument();
    expect(screen.queryByTestId('home.issue-error')).not.toBeInTheDocument();
  });

  it('TC-BANR-006 webViewUrl이 http인 응답은 잘못된 응답이라 ISSUE 오류로 보인다', async () => {
    const { h } = await openHome({ routes: { [BANNERS_P1]: 'banner/banners__insecure-url' } });
    await advance(h, 5_000);
    expect(await screen.findByTestId('home.issue-error')).toBeInTheDocument();
  });

  it('TC-BANR-007 잘못된 thumbnailUrl 배너도 목록에 남고 이미지 대신 대체 배경이다', async () => {
    await openHome({ routes: { [BANNERS_P1]: 'banner/banners__bad-thumbnail' } });
    const second = await screen.findByTestId('home.issue-item-44444444-4444-4444-8444-444444444402');
    expect(second).toHaveTextContent('이슈 2');
    expect(second.querySelector('img')).toBeNull();
    expect(screen.getByTestId('home.issue-item-44444444-4444-4444-8444-444444444401').querySelector('img')).not.toBeNull();
  });

  it('TC-BANR-009 TC-BANR-027 게스트도 배너를 보고 누르면 로그인 요구 없이 새 탭이 열린다', async () => {
    const { h } = await openHome({ mode: 'guest' });
    fireEvent.click(await screen.findByTestId('home.issue-item-44444444-4444-4444-8444-444444444401'));
    expect(h.opener.opened).toEqual(['https://web.example.test/issues/1']);
    expect(screen.queryByTestId('toast.message')).not.toBeInTheDocument();
  });
});

describe('홈 알림 벨 (D-10, D-05)', () => {
  it('TC-HOME-050 hasUnread=true면 점이 있고 false면 DOM에서 빠진다', async () => {
    await openHome({ routes: { [UNREAD]: 'home/notifications-unread-status__true' } });
    expect(await screen.findByTestId('home.notification-unread-dot')).toBeInTheDocument();
  });

  it('TC-HOME-050 hasUnread=false면 점이 존재하지 않는다', async () => {
    await openHome();
    await loaded();
    await waitFor(() => expect(screen.getByTestId('home.notification-button')).toBeInTheDocument());
    expect(screen.queryByTestId('home.notification-unread-dot')).not.toBeInTheDocument();
  });

  it('TC-HOME-048 회원이 벨을 누르면 알림함(/notifications)으로 가고 뒤로 가면 홈이다', async () => {
    const { router, path } = await openHome();
    expect(screen.getByTestId('home.notification-button')).toHaveAccessibleName(t('noti.inbox.title'));
    fireEvent.click(screen.getByTestId('home.notification-button'));
    await screen.findByTestId('notifications.root');
    expect(path()).toBe('/notifications');
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
  });

  it('TC-HOME-049 REQ-HOME-046 게스트가 벨을 누르면 토스트만 뜨고 이동·미읽음 조회가 없다', async () => {
    const { h, path } = await openHome({ mode: 'guest' });
    fireEvent.click(screen.getByTestId('home.notification-button'));
    expect(toastText()).toBe(t('home.guest.notification'));
    expect(path()).toBe('/home');
    expect(h.ff.callsTo('GET /notifications/unread-status')).toHaveLength(0);
    expect(screen.queryByTestId('home.notification-unread-dot')).not.toBeInTheDocument();
  });

  it('TC-HOME-013 TC-HOME-012 게스트가 히어로 업로드 진입을 누르면 토스트만 뜨고 UploadEntry·요청이 늘지 않는다', async () => {
    const { h } = await openHome({ mode: 'guest' });
    expect(await screen.findByTestId('home.hero-empty')).toBeInTheDocument();
    const before = h.ff.calls.length;
    fireEvent.click(screen.getByTestId('home.hero-upload-button'));
    expect(toastText()).toBe(t('home.guest.upload'));
    expect(h.upload.starts).toBe(0);
    expect(h.ff.calls).toHaveLength(before);
    for (const path of ['/posts/today', '/posts/calendar', '/notifications/unread-status']) expect(h.ff.calls.some((c) => c.path === path)).toBe(false);
  });
});

describe('홈 새로고침·재로드 (Web: 새로고침 버튼, REQ-HOME-038~041)', () => {
  it('TC-HOME-035 REQ-HOME-038 새로고침 버튼: 내용을 유지한 채 인디케이터를 보이고 모든 섹션을 다시 요청해 성공하면 교체한다', async () => {
    const gate = deferred<void>();
    const { h } = await openHome();
    await screen.findByTestId('home.hero-photo');
    new FixtureRouter(h.ff).set(TODAY_POST, async () => {
      await gate.promise;
      return loadFixture('home/posts-today__posted-pending.json').toResponse();
    });
    new FixtureRouter(h.ff).set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-pending');
    expect(screen.queryByTestId('home.refresh-indicator')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: REFRESH_BUTTON_NAME }));
    expect(await screen.findByTestId('home.refresh-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('home.hero-photo')).toBeInTheDocument(); // 콘텐츠 유지
    expect(screen.queryByTestId('home.hero-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId(`home.popular-item-${id('202')}`)).toBeInTheDocument();

    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.getByTestId('home.hero-pending-badge')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId('home.refresh-indicator')).not.toBeInTheDocument());
    expect(screen.queryByTestId('toast.message')).not.toBeInTheDocument();
  });

  it('TC-HOME-035 REQ-HOME-039 새로고침이 연결 실패하면 기존 내용을 유지하고 토스트 "네트워크 연결을 확인해 주세요."를 한 번 띄운다', async () => {
    const { h } = await openHome();
    await screen.findByTestId('home.hero-photo');
    const router = new FixtureRouter(h.ff);
    router.set(TODAY_POST, networkFailure);
    fireEvent.click(screen.getByRole('button', { name: REFRESH_BUTTON_NAME }));
    await advance(h, 2_000);
    await waitFor(() => expect(toastText()).toBe(t('common.error.network')));
    expect(screen.getByTestId('home.hero-photo')).toBeInTheDocument();
    expect(screen.queryByTestId('home.hero-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home.refresh-indicator')).not.toBeInTheDocument();
  });

  it('TC-HOME-039 REQ-HOME-040 문서가 숨겨졌다가 다시 보이면 인디케이터 없이 조용히 갱신한다(실패해도 토스트 없음)', async () => {
    const { h } = await openHome();
    await screen.findByTestId('home.hero-photo');
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    new FixtureRouter(h.ff).set(TODAY_POST, 'home/posts-today__posted-pending');
    new FixtureRouter(h.ff).set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-pending');
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.getByTestId('home.hero-pending-badge')).toBeInTheDocument());
    expect(screen.queryByTestId('home.refresh-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toast.message')).not.toBeInTheDocument();
  });

  it('TC-HOME-051 문서가 다시 보일 때마다 미읽음을 재조회한다', async () => {
    const { h, fixtures } = await openHome({ routes: { [UNREAD]: 'home/notifications-unread-status__false' } });
    await screen.findByTestId('home.hero-photo');
    expect(fixtures.calls(UNREAD)).toHaveLength(1);
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    fixtures.set(UNREAD, 'home/notifications-unread-status__true');
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByTestId('home.notification-unread-dot')).toBeInTheDocument();
    expect(h.ff.callsTo(UNREAD)).toHaveLength(2);
  });

  it('TC-HOME-041 REQ-HOME-041 KST 자정을 지나 문서가 다시 보이면 오늘=10/28, 어제 랭킹=10/27로 전체를 새로 불러온다', async () => {
    const { h } = await openHome();
    await screen.findByText('가을 하늘');
    const router = new FixtureRouter(h.ff);
    router
      .set('GET /topics?date=2026-10-28', 'home/topics__open-2026-10-28')
      .set('GET /posts?topicDate=2026-10-28&sort=popular&page=1&pageSize=20', 'home/posts-list__popular-5')
      .set(TODAY_POST, 'home/posts-today__404-no-open-topic');

    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    h.clock.setWallClock(Date.parse('2026-10-27T15:00:00Z'));
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByText('골목길')).toBeInTheDocument();
    expect(screen.getByTestId('home.topic-date')).toHaveTextContent('10월 28일 · 오늘의 주제');
    expect(screen.queryByText('가을 하늘')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('home.hero-no-open-topic')).toBeInTheDocument());
    expect(router.calls('GET /topics?date=2026-10-28')).toHaveLength(1);
    // 이번 주는 일요일 10/25 그대로(같은 주), 칸은 그대로 7개
    expect(screen.getAllByTestId(/^home\.week-day-/)).toHaveLength(7);
  });
});

describe('홈 분석 screen_view (D-22)', () => {
  it('REQ-ANL 탭 화면은 게이트를 통과해 그려진 홈이 home 1회를 보낸다(StrictMode에서도 1회, issue는 없음)', async () => {
    const { h } = await openHome({ strict: true });
    await screen.findByTestId('home.hero-photo');
    expect(screenViews(h.tracker)).toEqual(['home']);
  });

  it('게스트의 홈도 home 1회를 보낸다', async () => {
    const { h } = await openHome({ mode: 'guest' });
    await screen.findByTestId('home.hero-empty');
    expect(screenViews(h.tracker)).toEqual(['home']);
  });

  it('새로고침·문서 복귀로는 screen_view를 다시 보내지 않는다', async () => {
    const { h } = await openHome();
    await screen.findByTestId('home.hero-photo');
    fireEvent.click(screen.getByRole('button', { name: REFRESH_BUTTON_NAME }));
    await waitFor(() => expect(screen.queryByTestId('home.refresh-indicator')).not.toBeInTheDocument());
    expect(screenViews(h.tracker)).toEqual(['home']);
  });
});

describe('홈 testID 존재 (TC-HOME-057)', () => {
  it('TC-HOME-057 회원 홈의 주요 식별자가 모두 있다', async () => {
    await openHome({ routes: { [UNREAD]: 'home/notifications-unread-status__true' } });
    await screen.findByTestId('home.hero-photo');
    for (const testId of [
      'home.root',
      'home.scroll',
      'home.notification-button',
      'home.notification-unread-dot',
      'home.topic-date',
      'home.topic-title',
      'home.hero-photo',
      'home.week-section',
      'home.week-count',
      'home.week-day-2026-10-27',
      'home.week-photo-2026-10-27',
      'home.ranking-section',
      'home.ranking-more-link',
      `home.ranking-item-${id('261')}`,
      'home.popular-section',
      'home.popular-more-link',
      `home.popular-item-${id('202')}`,
      'home.ai-card',
      'home.ai-request-button',
      'home.issue-section',
      'home.issue-item-44444444-4444-4444-8444-444444444401',
    ]) {
      expect(screen.getByTestId(testId), testId).toBeInTheDocument();
    }
  });
});
