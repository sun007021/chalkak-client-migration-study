import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { formatTodayTopicLabel, WEEKDAY_HEADERS } from '../../core/time/dateFormat';
import { KstDate } from '../../core/time/KstDate';
import { format, t } from '../../shared/copy';
import { createHomeHarness, MY_POST_ID } from './__testing__/createHomeHarness';
import type { HomeHarness } from './__testing__/createHomeHarness';
import { HomeScreen } from './HomeScreen';

const POP_TODAY = 'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20';
const POP_YEST = 'GET /posts?topicDate=2026-10-26&sort=popular&page=1&pageSize=20';
const ID = (n: string) => `22222222-2222-4222-8222-2222222222${n}`;
const BANNER = (n: string) => `44444444-4444-4444-8444-4444444444${n}`;

async function renderHome(h: HomeHarness, ready = true) {
  const view = await render(
    <HomeScreen viewModel={h.viewModel} renderAiCard={(id) => <Text>{`ai-card:${id}`}</Text>} />,
  );
  if (ready) await screen.findByTestId('home.hero-photo');
  return view;
}

describe('HomeScreen 수명주기와 머리글', () => {
  it('TC-HOME-057 화면이 보이면 onShown으로 로드를 시작하고, 사라지면 onHidden으로 정리한다', async () => {
    const h = await createHomeHarness();
    const { unmount } = await renderHome(h);
    expect(screen.getByTestId('home.root')).toBeOnTheScreen();
    expect(screen.getByTestId('home.scroll')).toBeOnTheScreen();
    expect(h.visibility.listenerCount).toBe(1);
    await unmount();
    expect(h.visibility.listenerCount).toBe(0);
  });

  it('TC-HOME-053 REQ-HOME-004 날짜 라벨은 "10월 27일 · 오늘의 주제", 제목은 주제 제목이다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    expect(screen.getByTestId('home.topic-date')).toHaveTextContent(
      formatTodayTopicLabel(KstDate.of(2026, 10, 27)),
    );
    expect(screen.getByTestId('home.topic-date')).toHaveTextContent('10월 27일 · 오늘의 주제');
    expect(screen.getByTestId('home.topic-title')).toHaveTextContent('가을 하늘');
  });

  it('TC-HOME-001 REQ-HOME-005 로딩 중 머리글·히어로는 "오늘의 주제를 불러오는 중"이다', async () => {
    const h = await createHomeHarness();
    const gate = deferred<void>();
    h.router.set('GET /topics?date=2026-10-27', async () => {
      await gate.promise;
      return fixtureResponse('home/topics__open-2026-10-27');
    });
    h.router.set('GET /posts/today', async () => {
      await gate.promise;
      return fixtureResponse('home/posts-today__posted-approved');
    });
    await renderHome(h, false);
    expect(await screen.findByTestId('home.hero-loading')).toHaveTextContent(
      t('home.topic.loading'),
    );
    expect(screen.getByTestId('home.topic-title')).toHaveTextContent(t('home.topic.loading'));
    await act(async () => gate.resolve());
    expect(await screen.findByTestId('home.hero-photo')).toBeOnTheScreen();
    expect(screen.queryByTestId('home.hero-loading')).not.toBeOnTheScreen();
  });

  it('TC-HOME-018 주제 404는 "오늘의 주제가 아직 준비되지 않았어요"이고 날짜 라벨 없이 오류 문구와 구분된다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /topics?date=2026-10-27', 'home/topics__404-not-found');
    await renderHome(h);
    expect(screen.getByTestId('home.topic-title')).toHaveTextContent(t('home.topic.not-ready'));
    expect(screen.queryByText(t('home.topic.error'))).not.toBeOnTheScreen();
    expect(screen.getByTestId('home.popular-empty')).toHaveTextContent(t('home.ranking.empty'));
  });

  it('REQ-HOME-005 주제 조회 실패는 오류 문구와 다시 시도 버튼이며 누르면 retryTopic이다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /topics?date=2026-10-27', 'home/posts-list__500-server-error');
    await renderHome(h);
    expect(screen.getByTestId('home.topic-title')).toHaveTextContent(t('home.topic.error'));
    h.router.set('GET /topics?date=2026-10-27', 'home/topics__open-2026-10-27');
    await fireEvent.press(screen.getByTestId('home.retry-button'));
    expect(await screen.findByText('가을 하늘')).toBeOnTheScreen();
    expect(screen.queryByTestId('home.retry-button')).not.toBeOnTheScreen();
  });
});

describe('HomeScreen 히어로 7상태 (D-06)', () => {
  it('TC-HOME-002 no-open-topic: 문구만 있고 다시 시도 버튼은 없다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__404-no-open-topic');
    await renderHome(h, false);
    expect(await screen.findByTestId('home.hero-no-open-topic')).toHaveTextContent(
      t('home.hero.no-topic'),
    );
    expect(screen.queryByTestId('home.hero-retry-button')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('home.hero-error')).not.toBeOnTheScreen();
  });

  it('TC-HOME-003 REQ-HOME-009 empty: "\\"가을 하늘\\" 사진을 공유하지 않았어요" + 업로드 진입 버튼, 누르면 게이트', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__not-posted');
    await renderHome(h, false);
    expect(await screen.findByTestId('home.hero-empty')).toHaveTextContent(
      format(t('home.hero.empty'), { 주제: '가을 하늘' }),
    );
    await fireEvent.press(screen.getByTestId('home.hero-upload-button'));
    expect(h.navigator.calls).toEqual([{ type: 'upload-gate' }]);
  });

  it('REQ-HOME-009 주제 제목이 없으면 empty 문구의 주제 자리는 "오늘의 주제"다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__not-posted');
    h.router.set('GET /topics?date=2026-10-27', 'home/topics__404-not-found');
    await renderHome(h, false);
    expect(await screen.findByTestId('home.hero-empty')).toHaveTextContent(
      format(t('home.hero.empty'), { 주제: '오늘의 주제' }),
    );
  });

  it('TC-HOME-004 processing: "사진을 처리하고 있어요"', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__posted-validating');
    await renderHome(h, false);
    expect(await screen.findByTestId('home.hero-processing')).toHaveTextContent(
      t('home.hero.processing'),
    );
  });

  it('TC-HOME-005 REQ-HOME-011 PENDING: 사진 + "검수 대기" 배지', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__posted-pending');
    h.router.set(
      'GET /posts/calendar?year=2026&month=10',
      'home/posts-calendar__2026-10-week-pending',
    );
    await renderHome(h);
    expect(screen.getByTestId('home.hero-pending-badge')).toHaveTextContent(
      t('home.weekly.badge-pending'),
    );
  });

  it('TC-HOME-006 REQ-HOME-012 APPROVED: 배지 없는 사진', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    expect(screen.getByTestId('home.hero-photo')).toBeOnTheScreen();
    expect(screen.queryByTestId('home.hero-pending-badge')).not.toBeOnTheScreen();
  });

  it('TC-HOME-009 REQ-HOME-015 error: 문구 + 다시 시도 버튼, 누르면 성공 상태로 바뀐다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__500-server-error');
    await renderHome(h, false);
    expect(await screen.findByTestId('home.hero-error')).toHaveTextContent(t('home.hero.error'));
    expect(screen.getByTestId('home.hero-retry-button')).toHaveTextContent(t('home.hero.retry'));

    h.router.set('GET /posts/today', 'home/posts-today__posted-approved');
    await fireEvent.press(screen.getByTestId('home.hero-retry-button'));
    expect(await screen.findByTestId('home.hero-photo')).toBeOnTheScreen();
    expect(screen.queryByTestId('home.hero-error')).not.toBeOnTheScreen();
  });

  it('TC-HOME-008 정지 회원은 empty 모양이고 업로드 버튼을 누르면 정지 안내 토스트가 뜬다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__403-banned');
    await renderHome(h, false);
    await screen.findByTestId('home.hero-empty');
    await fireEvent.press(screen.getByTestId('home.hero-upload-button'));
    expect(h.toast.messages).toEqual([t('home.hero.banned')]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-HOME-013 게스트: empty이고 업로드 버튼은 로그인 요구 토스트다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await renderHome(h, false);
    await screen.findByTestId('home.hero-empty');
    await fireEvent.press(screen.getByTestId('home.hero-upload-button'));
    expect(h.toast.messages).toEqual([t('home.guest.upload')]);
  });
});

describe('HomeScreen AI 피드백 카드 자리', () => {
  it('TC-HOME-054 APPROVED 오늘 사진이면 home.ai-card 안에 카드 본문을 그린다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    expect(
      within(screen.getByTestId('home.ai-card')).getByText(`ai-card:${MY_POST_ID}`),
    ).toBeOnTheScreen();
  });

  it.each(['home/posts-today__posted-pending', 'home/posts-today__not-posted'])(
    'TC-HOME-054 %s에서는 카드가 없다',
    async (fixture) => {
      const h = await createHomeHarness();
      h.router.set('GET /posts/today', fixture);
      await renderHome(h, false);
      await screen.findByTestId(
        fixture.includes('pending') ? 'home.hero-photo' : 'home.hero-empty',
      );
      expect(screen.queryByTestId('home.ai-card')).not.toBeOnTheScreen();
    },
  );
});

describe('HomeScreen 이번 주 기록', () => {
  it('TC-HOME-024 REQ-HOME-021 "이번 주 기록" 제목, N/7, 일~토 7칸(요일·날짜), 사진이 있는 날만 사진이 있다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    const section = screen.getByTestId('home.week-section');
    expect(within(section).getByText(t('home.weekly.title'))).toBeOnTheScreen();
    expect(screen.getByTestId('home.week-count')).toHaveTextContent('3/7');
    expect(within(section).getByText(t('home.weekly.more'))).toBeOnTheScreen();

    const dates = ['25', '26', '27', '28', '29', '30', '31'];
    dates.forEach((day, i) => {
      const cell = screen.getByTestId(`home.week-day-2026-10-${day}`);
      expect(within(cell).getByText(WEEKDAY_HEADERS[i])).toBeOnTheScreen();
      expect(within(cell).getByText(day)).toBeOnTheScreen();
    });
    for (const day of ['25', '26', '27']) {
      expect(screen.getByTestId(`home.week-photo-2026-10-${day}`)).toBeOnTheScreen();
    }
    for (const day of ['28', '29', '30', '31']) {
      expect(screen.queryByTestId(`home.week-photo-2026-10-${day}`)).not.toBeOnTheScreen();
    }
  });

  it('REQ-HOME-022 PENDING 칸에는 "대기" 라벨이 붙는다', async () => {
    const h = await createHomeHarness();
    h.router.set(
      'GET /posts/calendar?year=2026&month=10',
      'home/posts-calendar__2026-10-week-pending',
    );
    await renderHome(h);
    expect(
      within(screen.getByTestId('home.week-day-2026-10-27')).getByText(t('home.weekly.pending')),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('home.week-day-2026-10-26')).queryByText(t('home.weekly.pending')),
    ).not.toBeOnTheScreen();
  });

  it('TC-HOME-031 기록 있는 칸을 누르면 그 날짜로 기록 탭, 없는 칸은 무반응, 보러가기는 기록 탭', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    await fireEvent.press(screen.getByTestId('home.week-day-2026-10-26'));
    await fireEvent.press(screen.getByTestId('home.week-day-2026-10-29'));
    await fireEvent.press(screen.getByText(t('home.weekly.more')));
    expect(h.navigator.calls).toEqual([
      { type: 'record', selectedDate: '2026-10-26' },
      { type: 'record', selectedDate: null },
    ]);
  });

  it('TC-HOME-032 REQ-HOME-025 주간 실패는 이 섹션만 "기록을 불러오지 못했어요" + 다시 시도', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__500-server-error');
    await renderHome(h);
    expect(screen.getByTestId('home.week-error')).toHaveTextContent(t('home.weekly.error'));
    expect(screen.getByTestId('home.popular-section')).toBeOnTheScreen();

    h.router.set(
      'GET /posts/calendar?year=2026&month=10',
      'home/posts-calendar__2026-10-week-approved',
    );
    await fireEvent.press(screen.getByTestId('home.week-retry-button'));
    expect(await screen.findByTestId('home.week-photo-2026-10-27')).toBeOnTheScreen();
    expect(screen.queryByTestId('home.week-error')).not.toBeOnTheScreen();
  });

  it('REQ-HOME-026 게스트는 7칸이 모두 빈 칸이고 0/7이다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await renderHome(h, false);
    await screen.findByTestId('home.week-day-2026-10-27');
    expect(screen.getByTestId('home.week-count')).toHaveTextContent('0/7');
    expect(screen.queryByTestId('home.week-photo-2026-10-27')).not.toBeOnTheScreen();
  });
});

describe('HomeScreen 랭킹·오늘 인기', () => {
  it('TC-HOME-015 TC-HOME-016 섹션 제목과 항목 수(최대 5)·testID가 맞다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    expect(
      within(screen.getByTestId('home.popular-section')).getByText(t('home.ranking.today')),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('home.ranking-section')).getByText(t('home.ranking.yesterday')),
    ).toBeOnTheScreen();
    for (const n of ['02', '03', '04', '05', '06']) {
      expect(screen.getByTestId(`home.popular-item-${ID(n)}`)).toBeOnTheScreen();
    }
    expect(screen.queryByTestId(`home.popular-item-${ID('07')}`)).not.toBeOnTheScreen();
    for (const n of ['61', '62', '63']) {
      expect(screen.getByTestId(`home.ranking-item-${ID(n)}`)).toBeOnTheScreen();
    }
  });

  it('TC-HOME-019 0장이면 "아직 올라온 사진이 없어요" 빈 상태다', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_TODAY, 'home/posts-list__popular-0');
    h.router.set(POP_YEST, 'home/posts-list__popular-0');
    await renderHome(h);
    expect(screen.getByTestId('home.popular-empty')).toHaveTextContent(t('home.ranking.empty'));
    expect(screen.getByTestId('home.ranking-empty')).toHaveTextContent(t('home.ranking.empty'));
  });

  it('TC-HOME-019 1장이어도 깨지지 않고 그 한 장만 보인다', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_TODAY, 'home/posts-list__popular-1');
    await renderHome(h);
    expect(screen.getByTestId(`home.popular-item-${ID('02')}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('home.popular-empty')).not.toBeOnTheScreen();
  });

  it('TC-HOME-020 REQ-HOME-030 랭킹 실패는 "{섹션 제목} 사진을 불러오지 못했어요" + 다시 시도, 다른 섹션은 유지', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_YEST, 'home/posts-list__500-server-error');
    await renderHome(h);
    expect(screen.getByTestId('home.ranking-error')).toHaveTextContent(
      format(t('home.ranking.error'), { '섹션 제목': t('home.ranking.yesterday') }),
    );
    expect(screen.getByTestId('home.popular-section')).toBeOnTheScreen();

    h.router.set(POP_YEST, 'home/posts-list__popular-3');
    await fireEvent.press(screen.getByTestId('home.ranking-retry-button'));
    expect(await screen.findByTestId(`home.ranking-item-${ID('61')}`)).toBeOnTheScreen();
  });

  it('TC-HOME-021 사진을 누르면 게시물 상세로, 더 보기는 해당 날짜 전시로 간다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    await fireEvent.press(screen.getByTestId(`home.popular-item-${ID('03')}`));
    await fireEvent.press(screen.getByTestId('home.ranking-more-link'));
    await fireEvent.press(screen.getByTestId('home.popular-more-link'));
    expect(h.navigator.calls).toMatchObject([
      { type: 'post-detail', postId: ID('03') },
      { type: 'display-popular', date: '2026-10-26' },
      { type: 'display-popular', date: '2026-10-27' },
    ]);
  });

  it('TC-HOME-022 게스트가 사진을 누르면 토스트만 뜬다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await renderHome(h, false);
    await fireEvent.press(await screen.findByTestId(`home.popular-item-${ID('02')}`));
    expect(h.toast.messages).toEqual([t('home.guest.feed')]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('REQ-HOME-033 하트를 누르면 컨트롤러에 위임되고 컨트롤러가 알린 값이 화면 개수·selected에 반영된다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    const like = `home.popular-like-button-${ID('02')}`;
    const count = `home.popular-like-count-${ID('02')}`;
    expect(screen.getByTestId(count)).toHaveTextContent('38');
    expect(screen.getByTestId(like)).not.toBeSelected();

    await fireEvent.press(screen.getByTestId(like));
    expect(h.likes.toggled).toEqual([{ postId: ID('02'), likeCount: 38, isLiked: false }]);

    await act(async () =>
      h.likes.emit({
        kind: 'updated',
        snapshot: { postId: ID('02'), likeCount: 39, isLiked: true },
      }),
    );
    expect(screen.getByTestId(count)).toHaveTextContent('39');
    expect(screen.getByTestId(like)).toBeSelected();
  });

  it('REQ-HOME-033 게스트가 하트를 누르면 토스트만 뜨고 컨트롤러는 호출되지 않는다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await renderHome(h, false);
    await fireEvent.press(await screen.findByTestId(`home.popular-like-button-${ID('02')}`));
    expect(h.toast.messages).toEqual([t('home.guest.like')]);
    expect(h.likes.toggled).toEqual([]);
  });
});

describe('HomeScreen ISSUE 배너', () => {
  it('TC-BANR-004(REQ) 제목 ISSUE와 배너 카드가 서버 순서로 그려진다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    const section = await screen.findByTestId('home.issue-section');
    expect(within(section).getByText(t('home.banner.title'))).toBeOnTheScreen();
    expect(screen.getByTestId(`home.issue-item-${BANNER('01')}`)).toBeOnTheScreen();
    expect(
      within(screen.getByTestId(`home.issue-item-${BANNER('01')}`)).getByText('이슈 1'),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId(`home.issue-item-${BANNER('01')}`)).getByText('찰칵 소식 1'),
    ).toBeOnTheScreen();
  });

  it('TC-BANR-029 카드의 접근성 라벨에 제목과 부제목이 있다(testID는 testids.md의 home.issue-item-{bannerId})', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    const item = await screen.findByTestId(`home.issue-item-${BANNER('02')}`);
    expect(item.props.accessibilityLabel).toContain('이슈 2');
    expect(item.props.accessibilityLabel).toContain('찰칵 소식 2');
  });

  it('TC-BANR-007 썸네일이 잘못된 배너도 카드가 그려진다(대체 배경)', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /banners?page=1&pageSize=10', 'banner/banners__bad-thumbnail');
    await renderHome(h);
    expect(await screen.findByTestId(`home.issue-item-${BANNER('02')}`)).toBeOnTheScreen();
  });

  it('TC-BANR-012(화면) 배너 카드를 누르면 웹뷰 이동을 요청한다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    await fireEvent.press(await screen.findByTestId(`home.issue-item-${BANNER('03')}`));
    expect(h.navigator.calls).toEqual([
      { type: 'banner', id: BANNER('03'), webViewUrl: 'https://web.example.test/issues/3' },
    ]);
  });

  it('TC-BANR-010 REQ-BANR-005 빈 응답이면 ISSUE 섹션 전체가 없다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /banners?page=1&pageSize=10', 'banner/banners__empty');
    await renderHome(h);
    expect(screen.queryByTestId('home.issue-section')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('home.issue-error')).not.toBeOnTheScreen();
  });

  it('TC-BANR-010 REQ-BANR-006 최초 조회 실패는 섹션 대신 "ISSUE를 불러오지 못했어요. 다시 시도"이고 다른 섹션은 영향이 없다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /banners?page=1&pageSize=10', 'banner/banners__500-server-error');
    await renderHome(h);
    expect(await screen.findByTestId('home.issue-error')).toHaveTextContent(t('home.banner.error'));
    expect(screen.queryByTestId('home.issue-section')).not.toBeOnTheScreen();
    expect(screen.getByTestId('home.hero-photo')).toBeOnTheScreen();

    h.router.set('GET /banners?page=1&pageSize=10', 'banner/banners__page1-10');
    await fireEvent.press(screen.getByTestId('home.issue-retry-button'));
    expect(await screen.findByTestId('home.issue-section')).toBeOnTheScreen();
  });
});

describe('HomeScreen ISSUE 프리패치(스크롤·레이아웃)', () => {
  const P2 = 'GET /banners?page=2&pageSize=10';
  const CARD_HEIGHT = 100;

  /** 뷰포트 1000, 섹션 y=0, 카드 i는 y=100*i로 레이아웃을 알린다. 카드 10장이 모두 보인다(마지막 index 9). */
  async function layoutAll(count = 10) {
    await fireEvent(screen.getByTestId('home.scroll'), 'layout', {
      nativeEvent: { layout: { height: 1000 } },
    });
    await fireEvent(await screen.findByTestId('home.issue-section'), 'layout', {
      nativeEvent: { layout: { y: 0 } },
    });
    for (let i = 1; i <= count; i += 1) {
      const id = BANNER(String(i).padStart(2, '0'));
      await fireEvent(screen.getByTestId(`home.issue-item-${id}`), 'layout', {
        nativeEvent: { layout: { y: (i - 1) * CARD_HEIGHT } },
      });
    }
  }
  const scrollBy = (y: number, height = 1000) =>
    fireEvent.scroll(screen.getByTestId('home.scroll'), {
      nativeEvent: {
        contentOffset: { y },
        layoutMeasurement: { height },
        contentSize: { height: 3000 },
      },
    });

  it('REQ-BANR-010 끝에 닿으면 page=2를 요청한다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    await layoutAll();
    await act(async () => {});
    expect(h.router.calls(P2)).toHaveLength(1);
    expect(await screen.findByTestId(`home.issue-item-${BANNER('11')}`)).toBeOnTheScreen();
  });

  it('REQ-BANR-009 TC-BANR-013 추가 페이지가 실패하면 같은 자리에서 다시 스크롤할 때 재요청한다(보이는 인덱스가 같아도)', async () => {
    const h = await createHomeHarness();
    h.router.set(P2, 'banner/banners__400-bad-query'); // 재시도 없는 실패(요청 횟수를 그대로 센다)
    await renderHome(h);
    await layoutAll();
    await act(async () => {});
    expect(h.router.calls(P2).length).toBeGreaterThan(0);

    h.router.set(P2, 'banner/banners__page2-last'); // set이 호출 기록을 비운다
    await scrollBy(5);
    await act(async () => {});
    expect(h.router.calls(P2)).toHaveLength(1);
    expect(await screen.findByTestId(`home.issue-item-${BANNER('11')}`)).toBeOnTheScreen();
  });

  it('REQ-BANR-009 실패 직후에는 스크롤이 없으면 스스로 재요청하지 않는다', async () => {
    const h = await createHomeHarness();
    h.router.set(P2, 'banner/banners__400-bad-query');
    await renderHome(h);
    await layoutAll();
    await act(async () => {});
    const before = h.router.calls(P2).length;
    await act(async () => {});
    await act(async () => {});
    expect(h.router.calls(P2)).toHaveLength(before);
  });

  it('TC-BANR-015 새로고침으로 목록이 처음 10개로 돌아온 뒤에도 끝에 닿으면 page=2를 다시 요청한다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    await layoutAll();
    await act(async () => {});
    await screen.findByTestId(`home.issue-item-${BANNER('11')}`);
    expect(h.router.calls(P2)).toHaveLength(1);
    // 11~13번째 카드도 레이아웃을 알린 상태(index 12까지 보임)
    for (let i = 11; i <= 13; i += 1) {
      await fireEvent(screen.getByTestId(`home.issue-item-${BANNER(String(i))}`), 'layout', {
        nativeEvent: { layout: { y: (i - 1) * CARD_HEIGHT } },
      });
    }
    await scrollBy(1, 1300); // 마지막 카드(index 12)까지 보인다

    await act(async () => {
      screen.getByTestId('home.scroll').props.refreshControl.props.onRefresh();
    });
    await screen.findByTestId('home.hero-photo');
    await waitForRefreshEnd();

    // 새 목록은 10장뿐인데 이전 카드 위치(index 10~12)가 남아 있으면 "여전히 12번째가 보임"으로 오해한다.
    await scrollBy(1, 1300);
    await act(async () => {});
    expect(h.router.calls(P2)).toHaveLength(2);
    expect(await screen.findByTestId(`home.issue-item-${BANNER('11')}`)).toBeOnTheScreen();
  });
});

async function waitForRefreshEnd() {
  await waitFor(() => expect(screen.queryByTestId('home.refresh-indicator')).not.toBeOnTheScreen());
}

describe('HomeScreen 알림 버튼·새로고침', () => {
  it('TC-HOME-050 hasUnread=true면 미읽음 점이 있고 false면 요소 자체가 없다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    expect(screen.queryByTestId('home.notification-unread-dot')).not.toBeOnTheScreen();

    h.router.set('GET /notifications/unread-status', 'home/notifications-unread-status__true');
    await act(async () => h.viewModel.onPushReceived());
    expect(screen.getByTestId('home.notification-unread-dot')).toBeOnTheScreen();
  });

  it('TC-HOME-048 알림 버튼을 누르면 알림함으로 간다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    await fireEvent.press(screen.getByTestId('home.notification-button'));
    expect(h.navigator.calls).toEqual([{ type: 'notifications' }]);
  });

  it('TC-HOME-049 게스트가 알림 버튼을 누르면 토스트만 뜬다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await renderHome(h, false);
    await screen.findByTestId('home.hero-empty');
    await fireEvent.press(screen.getByTestId('home.notification-button'));
    expect(h.toast.messages).toEqual([t('home.guest.notification')]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-HOME-035 당겨서 새로고침 중에는 인디케이터가 있고 기존 내용이 유지된다', async () => {
    const h = await createHomeHarness();
    await renderHome(h);
    expect(screen.queryByTestId('home.refresh-indicator')).not.toBeOnTheScreen();

    const gate = deferred<void>();
    h.router.set('GET /posts/today', async () => {
      await gate.promise;
      return fixtureResponse('home/posts-today__posted-approved');
    });
    const { refreshControl } = screen.getByTestId('home.scroll').props;
    await act(async () => {
      refreshControl.props.onRefresh();
    });
    expect(screen.getByTestId('home.refresh-indicator')).toBeOnTheScreen();
    expect(screen.getByTestId('home.hero-photo')).toBeOnTheScreen();

    await act(async () => gate.resolve());
    await screen.findByTestId('home.hero-photo');
    expect(screen.queryByTestId('home.refresh-indicator')).not.toBeOnTheScreen();
  });
});
