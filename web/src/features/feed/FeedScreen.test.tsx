import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { createLikeServer } from '../../test/likeServer';
import { MINE, OTHER, TODAY, deleteKey, detailKey, likeKey, postId, postsKey, titleKey } from '../../test/postRoutes';
import { advance, displayLoaded, idOf, openApp, toastText } from '../../test/postScreens';
import { screenViews } from '../../test/screenViews';
import type { PostSeed } from '../post/postModels';

vi.setConfig({ testTimeout: 15_000 }); // 구현 전에는 findBy가 5초 뒤 단언 오류로 끝나게 한다

const tid = (id: string) => screen.getByTestId(id);
const pressed = (id: string) => tid(id).getAttribute('aria-pressed');
const seedOther: PostSeed = {
  id: OTHER,
  authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalImageUrl: `https://cdn.example.test/posts/${OTHER}/original.webp`,
  thumbnailImageUrl: `https://cdn.example.test/posts/${OTHER}/thumbnail.webp`,
  title: '은행잎',
  likeCount: 38,
  isLiked: false,
  isMine: false,
};
const seedMine: PostSeed = { ...seedOther, id: MINE, authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: '비 오는 날', likeCount: 10, isMine: true };
const withSeed = (seed: PostSeed) => ({ pathname: `/feed/${seed.id}`, state: { seed } });
const confirmed = async () => waitFor(() => expect(tid('feed.like-button')).toBeEnabled());
const openMine = async (extra: Parameters<typeof openApp>[0] = {}) => {
  const view = await openApp({ path: withSeed(seedMine), ...extra });
  await confirmed();
  return view;
};

describe('상세 화면 구성 (TC-FEED-001, 002, 003, 013, 058)', () => {
  it('TC-FEED-058 TC-FEED-013 요소가 존재하고 날짜 라벨은 "M월 d일의 주제", 제목과 사진 설명이 보인다', async () => {
    await openApp({ path: withSeed(seedOther) });
    await confirmed();
    for (const id of ['feed.root', 'feed.back-button', 'feed.photo', 'feed.signature-image', 'feed.date-label', 'feed.title', 'feed.like-button', 'feed.like-count']) {
      expect(screen.getByTestId(id), id).toBeInTheDocument();
    }
    expect(tid('feed.date-label')).toHaveTextContent('10월 27일의 주제');
    expect(tid('feed.title')).toHaveTextContent('은행잎');
    expect(screen.getByAltText('작품 이미지: 은행잎')).toBeInTheDocument();
    expect(tid('feed.like-count')).toHaveTextContent('38');
    expect(screen.queryByTestId('feed.edit-title-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed.delete-button')).not.toBeInTheDocument();
  });

  it('TC-FEED-001 시드로 열면 상세 응답 전에도 시드 내용이 보이고 하트는 눌 수 없다. 응답 뒤에 활성화된다', async () => {
    const gate = deferred<void>();
    const { fixtures } = await openApp({ path: withSeed(seedOther), routes: { [detailKey(OTHER)]: gated(gate, 'feed/posts-detail__other') } });
    expect(tid('feed.title')).toHaveTextContent('은행잎');
    expect(tid('feed.like-count')).toHaveTextContent('38');
    expect(screen.queryByTestId('feed.loading')).not.toBeInTheDocument();
    expect(tid('feed.like-button')).toBeDisabled();
    fireEvent.click(tid('feed.like-button'));
    expect(fixtures.calls(likeKey('PUT', OTHER))).toHaveLength(0);
    await act(async () => gate.resolve());
    await confirmed();
    expect(tid('feed.date-label')).toHaveTextContent('10월 27일의 주제');
  });

  it('TC-FEED-002 시드 없이 딥링크로 열면 로딩 뒤 내용이 나온다', async () => {
    const gate = deferred<void>();
    await openApp({ path: `/feed/${OTHER}`, routes: { [detailKey(OTHER)]: gated(gate, 'feed/posts-detail__other') } });
    expect(await screen.findByTestId('feed.loading')).toBeInTheDocument();
    await act(async () => gate.resolve());
    await screen.findByTestId('feed.photo');
    expect(screen.queryByTestId('feed.loading')).not.toBeInTheDocument();
    expect(tid('feed.title')).toHaveTextContent('은행잎');
  });

  it('TC-FEED-003 썸네일이 null이어도 오류 없이 원본으로 그린다', async () => {
    const id = postId(205);
    await openApp({ path: `/feed/${id}`, routes: { [detailKey(id)]: 'feed/posts-detail__null-thumbnail' } });
    await screen.findByTestId('feed.photo');
    expect(screen.queryByTestId('feed.error-state')).not.toBeInTheDocument();
    expect(within(tid('feed.photo')).getByRole('img')).toHaveAttribute('src', `https://cdn.example.test/posts/${id}/original.webp`);
  });

  it('TC-FEED-013 제목이 없으면 "무제"와 "무제 작품 이미지"다', async () => {
    const id = postId(204);
    await openApp({ path: `/feed/${id}`, routes: { [detailKey(id)]: 'feed/posts-detail__no-title' } });
    await screen.findByTestId('feed.photo');
    expect(tid('feed.title')).toHaveTextContent(t('feed.title-none'));
    expect(screen.getByAltText(t('feed.photo-alt-none'))).toBeInTheDocument();
  });

  it('상세가 보이면 screen_view "feed"가 기록된다', async () => {
    const { h } = await openApp({ path: withSeed(seedOther) });
    await confirmed();
    expect(screenViews(h.tracker)).toEqual(['feed']);
  });

  it('TC-FEED-007 404면 "게시물을 찾을 수 없어요" 화면이다', async () => {
    await openApp({ path: `/feed/${OTHER}`, routes: { [detailKey(OTHER)]: 'feed/posts-detail__404-not-found' } });
    expect(await screen.findByTestId('feed.not-found-state')).toHaveTextContent(t('feed.not-found'));
    expect(screen.getByTestId('feed.back-button')).toBeInTheDocument(); // 닫을 수 있다
  });

  it('TC-FEED-008 500이면 오류 화면이고 다시 시도하면 내용이 나온다', async () => {
    const { fixtures, h } = await openApp({ path: `/feed/${OTHER}`, routes: { [detailKey(OTHER)]: 'feed/posts-detail__500-server-error' } });
    await advance(h, 2000); // GET 재시도 백오프는 가상 시간이다
    expect(await screen.findByTestId('feed.error-state')).toHaveTextContent(t('feed.error.load'));
    fixtures.set(detailKey(OTHER), 'feed/posts-detail__other');
    fireEvent.click(tid('feed.retry-button'));
    await screen.findByTestId('feed.photo');
    expect(screen.queryByTestId('feed.error-state')).not.toBeInTheDocument();
  });

  it('TC-FEED-012 시드가 있고 상세 실패면 내용은 유지하고 토스트만 띄운다', async () => {
    const { h } = await openApp({ path: withSeed(seedOther), routes: { [detailKey(OTHER)]: 'feed/posts-detail__500-server-error' } });
    await advance(h, 2000);
    await waitFor(() => expect(toastText()).toBe(t('feed.error.load')));
    expect(screen.queryByTestId('feed.error-state')).not.toBeInTheDocument();
    expect(tid('feed.title')).toHaveTextContent('은행잎');
    expect(tid('feed.like-button')).toBeDisabled();
  });
});

describe('상세 화면 접근 제한 (REQ-FEED-003, TC-FEED-005)', () => {
  it('TC-FEED-005 게스트가 /feed/{id}로 들어오면 홈으로 보내고 토스트를 띄우며 상세 요청은 0건이다', async () => {
    const { h, router } = await openApp({ mode: 'guest', path: `/feed/${OTHER}`, waitFor: 'home.root' });
    expect(router.state.location.pathname).toBe('/home');
    await waitFor(() => expect(toastText()).toBe(t('nav.guest.feed')));
    expect(h.ff.calls.filter((c) => c.path.startsWith('/posts/') && c.method === 'GET')).toEqual([]);
  });
});

describe('상세 닫기·뒤로가기 (TC-FEED-015, REQ-FEED 닫기)', () => {
  it('전시에서 push해서 연 상세의 닫기 버튼은 뒤로(POP)가기다', async () => {
    const { router } = await openApp();
    await displayLoaded();
    fireEvent.click(tid(`display.item-${OTHER}`));
    await screen.findByTestId('feed.root');
    fireEvent.click(tid('feed.back-button'));
    await screen.findByTestId('display.grid');
    expect(router.state.location.pathname).toBe('/display');
    expect(router.state.historyAction).toBe('POP');
  });

  it('새로고침·딥링크로 첫 항목이 된 상세의 닫기 버튼은 홈으로 replace한다(임시)', async () => {
    const { router } = await openApp({ path: `/feed/${OTHER}` });
    await screen.findByTestId('feed.photo');
    fireEvent.click(tid('feed.back-button'));
    await screen.findByTestId('home.root');
    expect(router.state.location.pathname).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
  });
});

describe('상세 화면 좋아요 (TC-LIKE-006, 009, 010, 025)', () => {
  it('TC-LIKE-006 확정 뒤 하트를 누르면 즉시 반영되고 서버 값으로 확정된다', async () => {
    const { fixtures } = await openApp({ path: withSeed(seedOther) });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await confirmed();
    fireEvent.click(tid('feed.like-button'));
    await waitFor(() => expect(pressed('feed.like-button')).toBe('true'));
    expect(tid('feed.like-count')).toHaveTextContent('39');
    await act(async () => server.succeed());
    expect(pressed('feed.like-button')).toBe('true');
  });

  it('TC-LIKE-009 실패하면 되돌리고 토스트를 띄운다', async () => {
    const { fixtures } = await openApp({ path: withSeed(seedOther) });
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await confirmed();
    fireEvent.click(tid('feed.like-button'));
    await waitFor(() => expect(server.inFlight).toBe(1));
    await act(async () => server.invalid());
    await waitFor(() => expect(pressed('feed.like-button')).toBe('false'));
    expect(toastText()).toBe(t('like.error.generic'));
  });

  it('TC-LIKE-010 좋아요가 404면 상세가 닫히고 전시 목록에서 그 사진이 사라진다', async () => {
    const { fixtures, router } = await openApp({ routes: { [likeKey('PUT', OTHER)]: 'like/posts-likes-put__404-not-found' } });
    await displayLoaded();
    fireEvent.click(tid(`display.item-${OTHER}`));
    await screen.findByTestId('feed.root');
    await confirmed();
    fireEvent.click(tid('feed.like-button'));
    await screen.findByTestId('display.grid');
    expect(router.state.location.pathname).toBe('/display');
    expect(screen.queryByTestId(`display.item-${OTHER}`)).not.toBeInTheDocument();
    expect(toastText()).toBe(t('like.error.generic'));
    expect(fixtures.calls(likeKey('PUT', OTHER))).toHaveLength(1);
  });

  it('TC-LIKE-025 상세에서 누른 좋아요는 돌아간 전시 카드에 즉시 같은 값으로 보인다', async () => {
    const { fixtures } = await openApp();
    const server = createLikeServer({ router: fixtures }, OTHER, { isLiked: false, likeCount: 38 });
    await displayLoaded();
    fireEvent.click(tid(`display.item-${OTHER}`));
    await confirmed();
    fireEvent.click(tid('feed.like-button'));
    await waitFor(() => expect(server.inFlight).toBe(1));
    await act(async () => server.succeed());
    fireEvent.click(tid('feed.back-button'));
    await screen.findByTestId('display.grid');
    expect(pressed(`display.like-button-${OTHER}`)).toBe('true');
    expect(tid(`display.like-count-${OTHER}`)).toHaveTextContent('39');
  });
});

describe('상세 화면 수정·삭제 버튼 (TC-FEED-016, 017, 034)', () => {
  it('TC-FEED-016 내 오늘 게시물에는 수정·삭제 버튼이 있다', async () => {
    await openMine();
    expect(screen.getByTestId('feed.edit-title-button')).toBeInTheDocument();
    expect(screen.getByTestId('feed.delete-button')).toBeInTheDocument();
  });

  it('TC-FEED-016 지난 주제의 내 게시물에는 수정 버튼이 없고 삭제 버튼은 있다', async () => {
    const id = postId(290);
    await openApp({ path: `/feed/${id}`, routes: { [detailKey(id)]: 'feed/posts-detail__mine-past' } });
    await screen.findByTestId('feed.photo');
    await waitFor(() => expect(screen.getByTestId('feed.delete-button')).toBeInTheDocument());
    expect(screen.queryByTestId('feed.edit-title-button')).not.toBeInTheDocument();
  });

  it('TC-FEED-017 화면이 열린 채 KST 자정을 지나면 수정 버튼이 사라진다', async () => {
    const h0 = await openMine();
    await advance(h0.h, 12 * 3600 * 1000 - 1); // 하네스 시계는 KST 12:00이다: 23:59:59.999
    expect(screen.getByTestId('feed.edit-title-button')).toBeInTheDocument();
    await advance(h0.h, 1); // 자정
    await waitFor(() => expect(screen.queryByTestId('feed.edit-title-button')).not.toBeInTheDocument());
    expect(screen.getByTestId('feed.delete-button')).toBeInTheDocument();
  });

  it('TC-FEED-034 시드가 내 글이어도 상세 확정 전에는 수정·삭제 버튼을 누를 수 없다', async () => {
    const gate = deferred<void>();
    await openApp({ path: withSeed(seedMine), routes: { [detailKey(MINE)]: gated(gate, 'feed/posts-detail__mine-today') } });
    const del = screen.queryByTestId('feed.delete-button');
    if (del) expect(del).toBeDisabled();
    await act(async () => gate.resolve());
    await confirmed();
    expect(tid('feed.delete-button')).toBeEnabled();
  });
});

describe('상세 화면 제목 수정 (TC-FEED-018~033)', () => {
  it('TC-FEED-018 열면 현재 제목이 채워지고 취소는 요청을 보내지 않는다', async () => {
    const { fixtures } = await openMine();
    fireEvent.click(tid('feed.edit-title-button'));
    const dialog = await screen.findByTestId('feed.title-dialog');
    expect(within(dialog).getByTestId('feed.title-input')).toHaveValue('비 오는 날');
    expect(within(dialog).getByTestId('feed.title-input')).toHaveAttribute('placeholder', t('feed.edit.placeholder'));
    expect(tid('feed.title-save-button')).toHaveTextContent(t('feed.edit.save'));
    expect(tid('feed.title-cancel-button')).toHaveTextContent(t('feed.edit.cancel'));
    fireEvent.click(tid('feed.title-cancel-button'));
    await waitFor(() => expect(screen.queryByTestId('feed.title-dialog')).not.toBeInTheDocument());
    expect(fixtures.calls(titleKey(MINE))).toHaveLength(0);
  });

  it('TC-FEED-019 TC-FEED-020 입력은 code point 10개까지만 들어간다(붙여넣기 포함)', async () => {
    await openMine();
    fireEvent.click(tid('feed.edit-title-button'));
    const input = (await screen.findByTestId('feed.title-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '😀'.repeat(11) } });
    expect(Array.from(input.value)).toHaveLength(10);
    fireEvent.change(input, { target: { value: '👨‍👩‍👧👨‍👩‍👧가' } });
    expect(Array.from(input.value)).toHaveLength(10);
  });

  it('TC-FEED-021 TC-FEED-024 공백을 제거해 저장하면 PUT 본문·제목 표시·토스트가 맞고 다이얼로그가 닫힌다', async () => {
    const { fixtures } = await openMine();
    fireEvent.click(tid('feed.edit-title-button'));
    fireEvent.change(await screen.findByTestId('feed.title-input'), { target: { value: ' 가나다라마바사아자차 ' } });
    fireEvent.click(tid('feed.title-save-button'));
    await waitFor(() => expect(toastText()).toBe(t('feed.edit.success')));
    expect(JSON.parse(fixtures.calls(titleKey(MINE))[0]!.body as string)).toEqual({ title: '가나다라마바사아자차' });
    expect(screen.queryByTestId('feed.title-dialog')).not.toBeInTheDocument();
    expect(tid('feed.title')).toHaveTextContent('가나다라마바사아자차');
  });

  it('TC-FEED-022 빈 입력을 저장하면 title: null을 보내고 "무제"로 표시된다', async () => {
    const { fixtures } = await openMine({ routes: { [titleKey(MINE)]: 'feed/posts-title-update__200-null-title' } });
    fireEvent.click(tid('feed.edit-title-button'));
    fireEvent.change(await screen.findByTestId('feed.title-input'), { target: { value: '' } });
    fireEvent.click(tid('feed.title-save-button'));
    await waitFor(() => expect(tid('feed.title')).toHaveTextContent(t('feed.title-none')));
    expect(JSON.parse(fixtures.calls(titleKey(MINE))[0]!.body as string)).toEqual({ title: null });
  });

  it('TC-FEED-025 저장 중에는 "저장 중..."이고 버튼이 비활성이며 연타해도 PUT은 1회다', async () => {
    const gate = deferred<void>();
    const { fixtures } = await openMine({ routes: { [titleKey(MINE)]: gated(gate, 'feed/posts-title-update__200') } });
    fireEvent.click(tid('feed.edit-title-button'));
    fireEvent.change(await screen.findByTestId('feed.title-input'), { target: { value: '가나다' } });
    fireEvent.click(tid('feed.title-save-button'));
    fireEvent.click(tid('feed.title-save-button'));
    expect(await screen.findByTestId('feed.title-saving')).toBeInTheDocument();
    expect(tid('feed.title-save-button')).toBeDisabled();
    expect(tid('feed.title-save-button')).toHaveTextContent(t('feed.edit.saving'));
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByTestId('feed.title-dialog')).not.toBeInTheDocument());
    expect(fixtures.calls(titleKey(MINE))).toHaveLength(1);
  });

  it.each([
    ['TC-FEED-027', 'feed/posts-title-update__400-not-editable', t('feed.edit.error.state')],
    ['TC-FEED-029', 'feed/posts-title-update__403-banned', t('feed.edit.error.banned')],
  ])('%s 실패하면 다이얼로그를 닫지 않고 사유를 보이며 제목은 그대로다', async (_tc, fixture, message) => {
    await openMine({ routes: { [titleKey(MINE)]: fixture } });
    fireEvent.click(tid('feed.edit-title-button'));
    fireEvent.change(await screen.findByTestId('feed.title-input'), { target: { value: '새 제목' } });
    fireEvent.click(tid('feed.title-save-button'));
    await waitFor(() => expect(within(tid('feed.title-dialog')).getByText(message)).toBeInTheDocument());
    expect(tid('feed.title-input')).toHaveValue('새 제목');
    expect(tid('feed.title')).toHaveTextContent('비 오는 날');
  });

  it('TC-FEED-030 수정 404면 다이얼로그를 닫고 "게시물을 찾을 수 없어요" 화면이 된다', async () => {
    await openMine({ routes: { [titleKey(MINE)]: 'feed/posts-title-update__404-not-found' } });
    fireEvent.click(tid('feed.edit-title-button'));
    fireEvent.change(await screen.findByTestId('feed.title-input'), { target: { value: '새 제목' } });
    fireEvent.click(tid('feed.title-save-button'));
    expect(await screen.findByTestId('feed.not-found-state')).toBeInTheDocument();
    expect(screen.queryByTestId('feed.title-dialog')).not.toBeInTheDocument();
  });
});

describe('상세 화면 삭제 (TC-FEED-035~045)', () => {
  it('TC-FEED-035 삭제 버튼은 확인창("게시물 삭제" / "게시물을 삭제하시겠어요?" / "삭제")을 열고 취소하면 요청이 없다', async () => {
    const { fixtures } = await openMine();
    fireEvent.click(tid('feed.delete-button'));
    const dialog = await screen.findByTestId('feed.delete-dialog');
    expect(within(dialog).getByTestId('feed.delete-title')).toHaveTextContent(t('feed.delete.title'));
    expect(within(dialog).getByTestId('feed.delete-body')).toHaveTextContent(t('feed.delete.body'));
    expect(within(dialog).getByTestId('feed.delete-confirm-button')).toHaveTextContent(t('feed.delete.confirm'));
    expect(within(dialog).getByTestId('feed.delete-cancel-button')).toHaveTextContent(t('feed.delete.cancel'));
    fireEvent.click(tid('feed.delete-cancel-button'));
    await waitFor(() => expect(screen.queryByTestId('feed.delete-dialog')).not.toBeInTheDocument());
    expect(fixtures.calls(deleteKey(MINE))).toHaveLength(0);
  });

  it('TC-FEED-036 전시에서 연 내 게시물을 삭제하면 전시로 돌아가 목록에서 빠지고 토스트가 한 번 뜬다', async () => {
    const { fixtures, router, h } = await openApp();
    await displayLoaded();
    fireEvent.click(tid(`display.item-${MINE}`));
    await confirmed();
    fireEvent.click(tid('feed.delete-button'));
    fireEvent.click(await screen.findByTestId('feed.delete-confirm-button'));
    await screen.findByTestId('display.grid');
    expect(router.state.location.pathname).toBe('/display');
    expect(screen.queryByTestId(`display.item-${MINE}`)).not.toBeInTheDocument();
    expect(toastText()).toBe(t('feed.delete.success'));
    expect(fixtures.calls(deleteKey(MINE))).toHaveLength(1);
    await advance(h, 2500);
    expect(toastText()).toBeNull();
  });

  it('TC-FEED-038 삭제 중에는 진행 표시가 보이고 연타해도 DELETE는 1회다', async () => {
    const gate = deferred<void>();
    const { fixtures } = await openMine({ routes: { [deleteKey(MINE)]: async () => { await gate.promise; return new Response(null, { status: 204 }); } } });
    fireEvent.click(tid('feed.delete-button'));
    const confirm = await screen.findByTestId('feed.delete-confirm-button');
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByTestId('feed.deleting')).toBeInTheDocument();
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByTestId('feed.root')).not.toBeInTheDocument());
    expect(fixtures.calls(deleteKey(MINE))).toHaveLength(1);
  });

  it.each([
    ['TC-FEED-039', 'feed/posts-delete__400-validating', t('feed.delete.error.state')],
    ['TC-FEED-040', 'feed/posts-delete__403-not-owner', t('feed.delete.error.forbidden')],
  ])('%s 실패하면 화면에 머물고 토스트로 알리며 다시 시도할 수 있다', async (_tc, fixture, message) => {
    const { fixtures } = await openMine({ routes: { [deleteKey(MINE)]: fixture } });
    fireEvent.click(tid('feed.delete-button'));
    fireEvent.click(await screen.findByTestId('feed.delete-confirm-button'));
    await waitFor(() => expect(toastText()).toBe(message));
    expect(screen.getByTestId('feed.root')).toBeInTheDocument();
    expect(screen.getByTestId('feed.delete-button')).toBeEnabled();
    fixtures.set(deleteKey(MINE), 'feed/posts-delete__204');
    fireEvent.click(tid('feed.delete-button'));
    fireEvent.click(await screen.findByTestId('feed.delete-confirm-button'));
    await waitFor(() => expect(screen.queryByTestId('feed.root')).not.toBeInTheDocument());
  });

  it('TC-FEED-041 삭제 404면 "게시물을 찾을 수 없어요" 화면이 된다', async () => {
    await openMine({ routes: { [deleteKey(MINE)]: 'feed/posts-delete__404-not-found' } });
    fireEvent.click(tid('feed.delete-button'));
    fireEvent.click(await screen.findByTestId('feed.delete-confirm-button'));
    expect(await screen.findByTestId('feed.not-found-state')).toBeInTheDocument();
  });

  it('TC-FEED-046 홈에서 연 오늘 게시물을 삭제하고 홈으로 돌아가면 히어로가 비고 랭킹에서도 빠진다 (TC-HOME-046)', async () => {
    const { router } = await openApp({ path: '/home', routes: { [postsKey(TODAY, 'popular')]: 'home/posts-list__popular-8' } });
    await screen.findByTestId('home.hero-photo');
    fireEvent.click(tid('home.hero-photo'));
    await screen.findByTestId('feed.root');
    await confirmed();
    fireEvent.click(tid('feed.delete-button'));
    fireEvent.click(await screen.findByTestId('feed.delete-confirm-button'));
    await screen.findByTestId('home.root');
    expect(router.state.location.pathname).toBe('/home');
    await waitFor(() => expect(screen.queryByTestId('home.hero-photo')).not.toBeInTheDocument());
    expect(toastText()).toBe(t('feed.delete.success'));
    expect(screen.queryByTestId(`home.popular-item-${idOf(201)}`)).not.toBeInTheDocument();
  });
});

describe('보조 계약', () => {
  it('서버 응답이 계약을 어기면(invalid-schema) 시드 없이 열었을 때 "게시물 정보를 불러오지 못했어요"가 보인다 (TC-FEED-009)', async () => {
    await openApp({ path: `/feed/${OTHER}`, routes: { [detailKey(OTHER)]: json(200, { id: OTHER, likeCount: 'many' }) } });
    expect(await screen.findByTestId('feed.error-state')).toHaveTextContent(t('feed.error.invalid'));
  });
});
