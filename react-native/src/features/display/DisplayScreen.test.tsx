import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { d } from '../../core/time/__testing__/helpers';
import { format, t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import {
  createDisplayHarness,
  gatedRoute,
  ID,
  q,
  type DisplayHarness,
} from './__testing__/createDisplayHarness';
import { DisplayScreen } from './DisplayScreen';

const RECENT = q('2026-10-27', 'recent', 1);

async function renderDisplay(h: DisplayHarness, waitForGrid = true) {
  const view = await render(<DisplayScreen viewModel={h.viewModel} />);
  if (waitForGrid) await screen.findByTestId('display.grid');
  return view;
}

describe('DisplayScreen 상태별 렌더링', () => {
  it('TC-DISP-001 응답 전에는 로딩 표시이고 날짜 이동 버튼이 비활성이다', async () => {
    const h = await createDisplayHarness();
    const gate = gatedRoute(
      h.router,
      'GET /topics?date=2026-10-27',
      'display/topics__open-2026-10-27',
    );
    await renderDisplay(h, false);
    expect(await screen.findByTestId('display.loading')).toBeOnTheScreen();
    expect(screen.getByTestId('display.prev-date-button')).toBeDisabled();
    expect(screen.getByTestId('display.next-date-button')).toBeDisabled();
    await act(async () => gate.release());
    expect(await screen.findByTestId('display.grid')).toBeOnTheScreen();
    expect(screen.queryByTestId('display.loading')).not.toBeOnTheScreen();
  });

  it('TC-DISP-060 전시 식별자(루트, 날짜·주제·설명, 이전·다음·날짜 선택, 정렬 탭, 사진 카드, 좋아요)가 존재한다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    for (const id of [
      'display.root',
      'display.date-label',
      'display.topic-title',
      'display.description',
      'display.prev-date-button',
      'display.next-date-button',
      'display.date-picker-button',
      'display.sort-recent-tab',
      'display.sort-popular-tab',
      'display.sort-random-tab',
      'display.grid',
      `display.item-${ID('02')}`,
      `display.like-button-${ID('02')}`,
      `display.like-count-${ID('02')}`,
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  });

  it('TC-DISP-041 날짜 라벨은 topicDate의 "M월 d일"(0 채움 없음)이고 주제 제목을 보여 준다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    expect(screen.getByTestId('display.date-label')).toHaveTextContent('10월 27일');
    expect(screen.getByTestId('display.topic-title')).toHaveTextContent('가을 하늘');
  });

  it('TC-DISP-011 정렬 탭 3개가 보이고 기본은 최신순이며 누르면 선택이 바뀌고 해당 sort로 요청한다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    expect(screen.getByTestId('display.sort-recent-tab')).toBeSelected();
    expect(screen.getByTestId('display.sort-recent-tab')).toHaveTextContent(
      t('display.sort.recent'),
    );
    expect(screen.getByTestId('display.sort-popular-tab')).toHaveTextContent(
      t('display.sort.popular'),
    );
    expect(screen.getByTestId('display.sort-random-tab')).toHaveTextContent(
      t('display.sort.random'),
    );
    await fireEvent.press(screen.getByTestId('display.sort-popular-tab'));
    expect(screen.getByTestId('display.sort-popular-tab')).toBeSelected();
    expect(screen.getByTestId('display.sort-recent-tab')).not.toBeSelected();
    expect(h.callsOf(q('2026-10-27', 'popular', 1))).toBe(1);
  });

  it('TC-DISP-011 오늘 날짜의 설명 문구는 "같은 주제에서 다른 시선을 느껴보세요"다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    expect(screen.getByTestId('display.description')).toHaveTextContent(
      t('display.header.desc-latest'),
    );
  });

  it('TC-DISP-013 지난 날짜는 정렬 탭을 숨기고 추천 페이저 상위 5개 + 아카이브 설명을 보여 준다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-10-26'));
    await renderDisplay(h);
    expect(screen.queryByTestId('display.sort-recent-tab')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('display.sort-popular-tab')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('display.sort-random-tab')).not.toBeOnTheScreen();
    expect(screen.getByTestId('display.featured-pager')).toBeOnTheScreen();
    const featured = h.viewModel.getSnapshot().featured;
    expect(featured).toHaveLength(5);
    expect(screen.getByTestId(`display.featured-item-${featured[0].id}`)).toBeOnTheScreen();
    expect(screen.getByTestId('display.description')).toHaveTextContent(
      t('display.header.desc-archive'),
    );
  });

  it('TC-DISP-043 아카이브에 사진이 3개뿐이어도 깨지지 않고 3개만 추천에 쓴다', async () => {
    const h = await createDisplayHarness({
      routes: { [q('2026-10-26', 'popular', 1)]: 'display/posts-list__popular-3' },
    });
    await h.viewModel.openDate(d('2026-10-26'));
    await renderDisplay(h);
    expect(screen.getByTestId(`display.featured-item-${ID('61')}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`display.featured-item-${ID('64')}`)).not.toBeOnTheScreen();
  });

  it('TC-DISP-028 최초 전시일에서는 이전 버튼이 비활성이다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-09-17'));
    await renderDisplay(h);
    expect(screen.getByTestId('display.prev-date-button')).toBeDisabled();
    expect(screen.getByTestId('display.next-date-button')).toBeEnabled();
  });

  it('TC-DISP-029 오늘에서는 다음 버튼이 비활성이고 이전 버튼을 누르면 어제로 이동한다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    expect(screen.getByTestId('display.next-date-button')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('display.prev-date-button'));
    expect(await screen.findByTestId('display.featured-pager')).toBeOnTheScreen();
    expect(screen.getByTestId('display.date-label')).toHaveTextContent('10월 26일');
    expect(screen.getByTestId('display.next-date-button')).toBeEnabled();
  });

  it('TC-DISP-036 날짜 버튼을 누르면 "날짜 선택" 시트가 열리고 연·월·일 휠이 있다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    await fireEvent.press(screen.getByTestId('display.date-picker-button'));
    const sheet = await screen.findByTestId('display.date-picker-sheet');
    expect(within(sheet).getByText(t('display.picker.title'))).toBeOnTheScreen();
    for (const id of ['year', 'month', 'day']) {
      expect(screen.getByTestId(`display.date-picker-${id}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('display.date-picker-confirm-button')).toBeOnTheScreen();
    expect(format(t('display.picker.year'), { n: 2026 })).toBe('2026년');
  });

  it('TC-DISP-006 빈 상태는 "이 날 올라온 사진이 없어요"이고 오류 화면이 아니다', async () => {
    const h = await createDisplayHarness({
      routes: { 'GET /topics?date=2026-10-27': 'display/topics__404-not-found' },
    });
    await renderDisplay(h, false);
    expect(await screen.findByTestId('display.empty-state')).toHaveTextContent(t('display.empty'));
    expect(screen.queryByTestId('display.error-state')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('display.retry-button')).not.toBeOnTheScreen();
  });

  it('TC-DISP-005 오류 상태는 "전시를 불러오지 못했어요" + 다시 시도이고, 누르면 같은 날짜로 재요청해 성공한다', async () => {
    const h = await createDisplayHarness();
    h.router.set(RECENT, (_r, i) =>
      fixtureResponse(
        i < 3 ? 'display/posts-list__500-server-error' : 'display/posts-list__recent-page1',
      ),
    );
    await renderDisplay(h, false);
    expect(await screen.findByTestId('display.error-state')).toHaveTextContent(t('display.error'));
    await fireEvent.press(screen.getByTestId('display.retry-button'));
    expect(await screen.findByTestId('display.grid')).toBeOnTheScreen();
    expect(screen.queryByTestId('display.error-state')).not.toBeOnTheScreen();
  });

  it('TC-DISP-005 연결 실패면 "네트워크 연결을 확인해 주세요."를 보여 준다', async () => {
    const h = await createDisplayHarness({
      routes: { 'GET /topics?date=2026-10-27': networkFailure() },
    });
    await renderDisplay(h, false);
    expect(await screen.findByTestId('display.error-state')).toHaveTextContent(
      t('common.error.network'),
    );
  });

  it('TC-DISP-010 재검증이 실패해도 그리드는 그대로이고 토스트만 요청된다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    h.router.set(RECENT, 'display/posts-list__500-server-error');
    await act(async () => h.viewModel.onTabReselected());
    expect(screen.getByTestId('display.grid')).toBeOnTheScreen();
    expect(screen.queryByTestId('display.error-state')).not.toBeOnTheScreen();
    expect(h.toast.messages).toEqual([t('display.error')]);
  });

  it('TC-DISP-012 정렬 변경 중에는 기존 사진 위에 새로고침 표시가 나온다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    const gate = gatedRoute(
      h.router,
      q('2026-10-27', 'popular', 1),
      'display/posts-list__popular-page1',
    );
    await fireEvent.press(screen.getByTestId('display.sort-popular-tab'));
    expect(await screen.findByTestId('display.refresh-indicator')).toBeOnTheScreen();
    expect(screen.getByTestId(`display.item-${ID('02')}`)).toBeOnTheScreen();
    await act(async () => gate.release());
    await flush();
    expect(screen.queryByTestId('display.refresh-indicator')).not.toBeOnTheScreen();
  });

  it('TC-DISP-022 다음 페이지를 불러오는 동안 하단 로딩 표시가 나온다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    const gate = gatedRoute(
      h.router,
      q('2026-10-27', 'recent', 2),
      'display/posts-list__recent-page2',
    );
    void act(async () => void h.viewModel.onLastVisibleIndexChanged(19));
    expect(await screen.findByTestId('display.load-more-indicator')).toBeOnTheScreen();
    await act(async () => gate.release());
    await flush();
    expect(screen.queryByTestId('display.load-more-indicator')).not.toBeOnTheScreen();
  });

  it('TC-DISP-054 게스트가 사진을 누르면 토스트가 요청되고 이동이 없다', async () => {
    const h = await createDisplayHarness({
      mode: 'guest',
      routes: { [RECENT]: 'display/posts-list__guest-page1' },
    });
    await renderDisplay(h);
    await fireEvent.press(screen.getByTestId(`display.item-${ID('02')}`));
    expect(h.toast.messages).toEqual([t('guest.feed')]);
    expect(h.navigator.opened).toEqual([]);
  });

  it('TC-DISP-055 사진을 누르면 목록 항목을 시드로 상세 이동을 요청한다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    await fireEvent.press(screen.getByTestId(`display.item-${ID('03')}`));
    expect(h.navigator.opened.map((o) => o.postId)).toEqual([ID('03')]);
  });
});

describe('DisplayScreen 좋아요', () => {
  it('TC-LIKE-003 TC-LIKE-034 하트 버튼은 selected와 접근성 라벨 "좋아요 N개"를 노출하고 컨트롤러 알림이 오면 즉시 갱신된다', async () => {
    const h = await createDisplayHarness();
    await renderDisplay(h);
    const button = () => screen.getByTestId(`display.like-button-${ID('02')}`);
    // [가정: 접근성 라벨 "좋아요 N개"는 ko.json에 키가 없어 화면이 직접 구성한다]
    expect(button().props.accessibilityLabel).toBe('좋아요 38개');
    expect(button()).not.toBeSelected();
    await fireEvent.press(button());
    expect(h.likes.toggled).toEqual([{ postId: ID('02'), likeCount: 38, isLiked: false }]);
    await act(async () =>
      h.likes.emit({
        kind: 'updated',
        snapshot: { postId: ID('02'), likeCount: 39, isLiked: true },
      }),
    );
    expect(button()).toBeSelected();
    expect(screen.getByTestId(`display.like-count-${ID('02')}`)).toHaveTextContent('39');
    expect(button().props.accessibilityLabel).toBe('좋아요 39개');
  });

  it('TC-LIKE-004 아카이브 추천 카드의 하트도 컨트롤러에 위임하고 그리드와 같은 값이 보인다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-10-26'));
    await renderDisplay(h);
    await fireEvent.press(screen.getByTestId(`display.featured-like-button-${ID('02')}`));
    expect(h.likes.toggled).toHaveLength(1);
    await act(async () =>
      h.likes.emit({
        kind: 'updated',
        snapshot: { postId: ID('02'), likeCount: 39, isLiked: true },
      }),
    );
    expect(screen.getByTestId(`display.featured-like-count-${ID('02')}`)).toHaveTextContent('39');
    expect(screen.getByTestId(`display.like-count-${ID('02')}`)).toHaveTextContent('39');
  });

  it('TC-LIKE-014 게스트가 하트를 누르면 토스트가 요청되고 컨트롤러는 호출되지 않는다', async () => {
    const h = await createDisplayHarness({
      mode: 'guest',
      routes: { [RECENT]: 'display/posts-list__guest-page1' },
    });
    await renderDisplay(h);
    await fireEvent.press(screen.getByTestId(`display.like-button-${ID('02')}`));
    expect(h.toast.messages).toEqual([t('guest.like')]);
    expect(h.likes.toggled).toEqual([]);
  });
});
