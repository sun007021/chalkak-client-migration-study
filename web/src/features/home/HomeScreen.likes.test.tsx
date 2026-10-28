import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { t } from '../../copy/ko';
import { createLikeServer } from '../../test/likeServer';
import { OTHER } from '../../test/postRoutes';
import { advance, idOf, openApp, toastText } from '../../test/postScreens';

vi.setConfig({ testTimeout: 15_000 }); // 구현 전에는 findBy가 5초 뒤 단언 오류로 끝나게 한다

const tid = (id: string) => screen.getByTestId(id);
const pressed = (id: string) => tid(id).getAttribute('aria-pressed');
const loaded = async () => screen.findByTestId(`home.popular-item-${OTHER}`);
const YESTERDAY_FIRST = idOf(261);

describe('홈 랭킹 좋아요 버튼 (REQ-HOME-033, TC-LIKE-005, 014, 034)', () => {
  it('TC-LIKE-034 오늘 인기·어제 랭킹 카드에 하트 버튼(aria-pressed, "좋아요 N개")과 개수가 있다', async () => {
    await openApp({ path: '/home' });
    await loaded();
    expect(pressed(`home.popular-like-button-${OTHER}`)).toBe('false');
    expect(tid(`home.popular-like-button-${OTHER}`)).toHaveAccessibleName('좋아요 38개');
    expect(tid(`home.popular-like-count-${OTHER}`)).toHaveTextContent('38');
    expect(pressed(`home.popular-like-button-${idOf(203)}`)).toBe('true');
    expect(tid(`home.ranking-like-count-${YESTERDAY_FIRST}`)).toHaveTextContent('30');
    expect(pressed(`home.ranking-like-button-${YESTERDAY_FIRST}`)).toBe('false');
  });

  it('TC-LIKE-005 오늘 인기 하트를 누르면 서버 응답 전에 즉시 반영되고 서버 값으로 확정된다', async () => {
    const { fixtures } = await openApp({ path: '/home' });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await loaded();
    fireEvent.click(tid(`home.popular-like-button-${OTHER}`));
    await waitFor(() => expect(pressed(`home.popular-like-button-${OTHER}`)).toBe('true'));
    expect(tid(`home.popular-like-count-${OTHER}`)).toHaveTextContent('39');
    await act(async () => server.succeed());
    expect(pressed(`home.popular-like-button-${OTHER}`)).toBe('true');
    expect(server.methods).toEqual(['PUT']);
  });

  it('어제 랭킹의 하트도 같은 규칙이다', async () => {
    const { fixtures } = await openApp({ path: '/home' });
    const server = createLikeServer({ router: fixtures }, YESTERDAY_FIRST, { isLiked: false, likeCount: 30 });
    await loaded();
    fireEvent.click(tid(`home.ranking-like-button-${YESTERDAY_FIRST}`));
    await waitFor(() => expect(pressed(`home.ranking-like-button-${YESTERDAY_FIRST}`)).toBe('true'));
    expect(tid(`home.ranking-like-count-${YESTERDAY_FIRST}`)).toHaveTextContent('31');
    await act(async () => server.succeed());
  });

  it('TC-LIKE-009 실패하면 되돌리고 토스트를 2.5초 동안 보인다', async () => {
    const { fixtures, h } = await openApp({ path: '/home' });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await loaded();
    fireEvent.click(tid(`home.popular-like-button-${OTHER}`));
    await waitFor(() => expect(server.inFlight).toBe(1));
    await act(async () => server.invalid());
    await waitFor(() => expect(pressed(`home.popular-like-button-${OTHER}`)).toBe('false'));
    expect(toastText()).toBe(t('like.error.generic'));
    await advance(h, 2500);
    expect(toastText()).toBeNull();
  });

  it('TC-LIKE-014 게스트가 하트를 누르면 토스트가 뜨고 상태·요청이 그대로다', async () => {
    const { h } = await openApp({ mode: 'guest', path: '/home' });
    await loaded();
    const calls = h.ff.calls.length;
    fireEvent.click(tid(`home.popular-like-button-${OTHER}`));
    await waitFor(() => expect(toastText()).toBe(t('nav.guest.like')));
    expect(pressed(`home.popular-like-button-${OTHER}`)).toBe('false');
    expect(h.ff.calls).toHaveLength(calls);
  });

  it('하트를 눌러도 카드의 상세 이동은 일어나지 않는다(버튼과 카드 탭이 분리)', async () => {
    const { fixtures, router } = await openApp({ path: '/home' });
    createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await loaded();
    fireEvent.click(tid(`home.popular-like-button-${OTHER}`));
    expect(router.state.location.pathname).toBe('/home');
  });
});

describe('홈 ↔ 전시 ↔ 상세 좋아요 동기 (TC-LIKE-025, REQ-HOME-033)', () => {
  it('홈에서 누른 좋아요는 전시의 같은 사진에 같은 값으로 보인다(전시가 새로 읽어도 되돌리지 않는다)', async () => {
    const { fixtures } = await openApp({ path: '/home' });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await loaded();
    fireEvent.click(tid(`home.popular-like-button-${OTHER}`));
    await waitFor(() => expect(server.inFlight).toBe(1));
    await act(async () => server.succeed());
    fireEvent.click(tid('bottom-bar.tab-display'));
    await screen.findByTestId(`display.like-button-${OTHER}`);
    await waitFor(() => expect(pressed(`display.like-button-${OTHER}`)).toBe('true'));
    expect(tid(`display.like-count-${OTHER}`)).toHaveTextContent('39');
  });

  it('전시에서 누른 좋아요는 홈 랭킹에 같은 값으로 보인다', async () => {
    const { fixtures } = await openApp({ path: '/display' });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await screen.findByTestId(`display.like-button-${OTHER}`);
    fireEvent.click(tid(`display.like-button-${OTHER}`));
    await waitFor(() => expect(server.inFlight).toBe(1));
    await act(async () => server.succeed());
    fireEvent.click(tid('bottom-bar.tab-home'));
    await loaded();
    await waitFor(() => expect(pressed(`home.popular-like-button-${OTHER}`)).toBe('true'));
    expect(tid(`home.popular-like-count-${OTHER}`)).toHaveTextContent('39');
  });

  it('REQ-HOME-033 계정이 바뀌면(UserCaches 비움) 이전 계정의 좋아요 상태가 남지 않는다', async () => {
    const { fixtures, h } = await openApp({ path: '/home' });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await loaded();
    fireEvent.click(tid(`home.popular-like-button-${OTHER}`));
    await waitFor(() => expect(server.inFlight).toBe(1));
    await act(async () => server.succeed());
    await act(async () => h.container.userCaches.clearAll());
    await waitFor(() => expect(pressed(`home.popular-like-button-${OTHER}`)).toBe('false'));
    expect(tid(`home.popular-like-count-${OTHER}`)).toHaveTextContent('38');
  });
});
