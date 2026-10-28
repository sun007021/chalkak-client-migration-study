import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { format, t } from '../../shared/copy';
import {
  createFeedHarness,
  DELETE_MINE,
  GET_MINE,
  GET_OTHER,
  gated,
  listSeed,
  MINE,
  OTHER,
  PUT_MINE,
  type FeedHarness,
} from './__testing__/createFeedHarness';
import { FeedScreen } from './FeedScreen';

async function renderFeed(h: FeedHarness, ready: string | null = 'feed.title') {
  const view = await render(<FeedScreen viewModel={h.viewModel} />);
  if (ready) await screen.findByTestId(ready);
  return view;
}
const openMine = (routes = {}) =>
  createFeedHarness({ open: { entry: 'mine', postId: MINE }, routes });
const openOther = (routes = {}) =>
  createFeedHarness({ open: { entry: 'list', seed: listSeed() }, routes });
const puts = (h: FeedHarness) => h.transport.requests.filter((r) => r.method === 'PUT');

describe('FeedScreen 내용', () => {
  it('TC-FEED-058 상세 식별자(루트, 뒤로, 사진, 사인, 날짜 라벨, 제목, 좋아요, 수정, 삭제)가 존재한다', async () => {
    const h = await openMine();
    await renderFeed(h);
    for (const id of [
      'feed.root',
      'feed.back-button',
      'feed.photo',
      'feed.signature-image',
      'feed.date-label',
      'feed.title',
      'feed.like-button',
      'feed.like-count',
      'feed.edit-title-button',
      'feed.delete-button',
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  });

  it('TC-FEED-013 날짜 라벨은 "M월 d일의 주제", 제목과 접근성 설명 "작품 이미지: {title}"을 보여 준다', async () => {
    const h = await openMine();
    await renderFeed(h);
    expect(screen.getByTestId('feed.date-label')).toHaveTextContent(
      format(t('feed.date-label'), { M: 10, d: 27 }),
    );
    expect(screen.getByTestId('feed.date-label')).toHaveTextContent('10월 27일의 주제');
    const title = screen.getByTestId('feed.title');
    expect(screen.getByTestId('feed.photo').props.accessibilityLabel).toBe(
      format(t('feed.photo-alt'), { 제목: title.props.children as string }),
    );
  });

  it('TC-FEED-013 TC-FEED-053 제목이 null이면 "무제"와 "무제 작품 이미지"를 보여 준다', async () => {
    const id = '22222222-2222-4222-8222-222222222204';
    const h = await createFeedHarness({
      open: { entry: 'list', postId: id },
      routes: { [`GET /posts/${id}`]: 'feed/posts-detail__no-title' },
    });
    await renderFeed(h);
    expect(screen.getByTestId('feed.title')).toHaveTextContent(t('feed.title-none'));
    expect(screen.getByTestId('feed.photo').props.accessibilityLabel).toBe(
      t('feed.photo-alt-none'),
    );
  });

  it('TC-FEED-014 사인 이미지 로드가 실패하면 사진은 그대로 두고 사인만 생략한다', async () => {
    const h = await openMine();
    await renderFeed(h);
    await fireEvent(screen.getByTestId('feed.signature-image'), 'error');
    expect(screen.queryByTestId('feed.signature-image')).not.toBeOnTheScreen();
    expect(screen.getByTestId('feed.photo')).toBeOnTheScreen();
  });

  it('TC-FEED-001 시드로 열면 응답 전에도 내용이 보이고 좋아요는 확정 뒤에 활성화된다', async () => {
    const h = await openOther();
    const gate = gated(h.router, GET_OTHER, 'feed/posts-detail__other');
    await renderFeed(h);
    expect(screen.getByTestId('feed.title')).toHaveTextContent('은행잎');
    expect(screen.getByTestId('feed.like-button')).toBeDisabled();
    await act(async () => gate.release());
    await screen.findByTestId('feed.date-label');
    expect(screen.getByTestId('feed.like-button')).toBeEnabled();
  });

  it('로딩 중(시드 없음)에는 feed.loading만 보인다', async () => {
    const h = await openMine();
    gated(h.router, GET_MINE, 'feed/posts-detail__mine-today');
    await renderFeed(h, 'feed.loading');
    expect(screen.queryByTestId('feed.title')).not.toBeOnTheScreen();
  });

  it('TC-FEED-007 404는 "게시물을 찾을 수 없어요" 화면이다', async () => {
    const h = await openMine({ [GET_MINE]: 'feed/posts-detail__404-not-found' });
    await renderFeed(h, 'feed.not-found-state');
    expect(screen.getByTestId('feed.not-found-state')).toHaveTextContent(t('feed.error.not-found'));
  });

  it.each([
    ['feed/posts-detail__500-server-error', t('feed.error.load')],
    ['feed/posts-detail__invalid-schema', t('feed.error.invalid')],
  ])(
    'TC-FEED-008 TC-FEED-009 %s는 "%s" + 다시 시도이고 누르면 다시 불러온다',
    async (fixture, message) => {
      const h = await openMine({ [GET_MINE]: fixture });
      await renderFeed(h, 'feed.error-state');
      expect(screen.getByTestId('feed.error-state')).toHaveTextContent(message);
      h.router.set(GET_MINE, 'feed/posts-detail__mine-today');
      await fireEvent.press(screen.getByTestId('feed.retry-button'));
      expect(await screen.findByTestId('feed.title')).toBeOnTheScreen();
    },
  );

  it('TC-FEED-008 연결 실패는 "네트워크 연결을 확인해 주세요."', async () => {
    const h = await openMine({ [GET_MINE]: networkFailure() });
    await renderFeed(h, 'feed.error-state');
    expect(screen.getByTestId('feed.error-state')).toHaveTextContent(t('common.error.network'));
  });

  it('뒤로 버튼은 화면을 닫는다', async () => {
    const h = await openMine();
    await renderFeed(h);
    await fireEvent.press(screen.getByTestId('feed.back-button'));
    expect(h.navigator.closeCount).toBe(1);
  });

  it('언마운트하면 진행 중 요청을 취소한다(onHidden)', async () => {
    const h = await openMine();
    gated(h.router, GET_MINE, 'feed/posts-detail__mine-today');
    const view = await renderFeed(h, 'feed.loading');
    await view.unmount();
    expect(h.likes.listenerCount).toBe(0);
  });
});

describe('FeedScreen 버튼 노출', () => {
  it('TC-FEED-016 TC-FEED-034 내 게시물 + 오늘이면 수정·삭제 버튼, 남의 게시물이면 둘 다 없다', async () => {
    const mine = await openMine();
    const view = await renderFeed(mine);
    expect(screen.getByTestId('feed.edit-title-button')).toBeOnTheScreen();
    expect(screen.getByTestId('feed.delete-button')).toBeOnTheScreen();
    await view.unmount();

    const other = await openOther();
    await renderFeed(other);
    await screen.findByTestId('feed.date-label');
    expect(screen.queryByTestId('feed.edit-title-button')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('feed.delete-button')).not.toBeOnTheScreen();
  });

  it('TC-FEED-016 지난 주제의 내 게시물은 수정 버튼이 없고 삭제 버튼만 있다', async () => {
    const id = '22222222-2222-4222-8222-222222222290';
    const h = await createFeedHarness({
      open: { entry: 'mine', postId: id },
      routes: { [`GET /posts/${id}`]: 'feed/posts-detail__mine-past' },
    });
    await renderFeed(h);
    expect(screen.queryByTestId('feed.edit-title-button')).not.toBeOnTheScreen();
    expect(screen.getByTestId('feed.delete-button')).toBeOnTheScreen();
  });
});

describe('FeedScreen 제목 수정 다이얼로그', () => {
  it('TC-FEED-018 열면 현재 제목·플레이스홀더·취소/저장이 있고 취소는 요청을 보내지 않는다', async () => {
    const h = await openMine();
    await renderFeed(h);
    await fireEvent.press(screen.getByTestId('feed.edit-title-button'));
    expect(await screen.findByTestId('feed.title-dialog')).toBeOnTheScreen();
    const input = screen.getByTestId('feed.title-input');
    expect(input.props.value).toBe(h.viewModel.getSnapshot().content?.title);
    expect(input.props.placeholder).toBe(t('feed.edit.placeholder'));
    expect(screen.getByTestId('feed.title-save-button')).toHaveTextContent(t('feed.edit.save'));
    expect(screen.getByTestId('feed.title-cancel-button')).toHaveTextContent(t('feed.edit.cancel'));
    await fireEvent.press(screen.getByTestId('feed.title-cancel-button'));
    expect(screen.queryByTestId('feed.title-dialog')).not.toBeOnTheScreen();
    expect(puts(h)).toEqual([]);
  });

  it('TC-FEED-019 입력창은 10 code point를 넘는 입력을 받지 않는다', async () => {
    const h = await openMine();
    await renderFeed(h);
    await fireEvent.press(screen.getByTestId('feed.edit-title-button'));
    const ten = '🙂'.repeat(10);
    await fireEvent.changeText(await screen.findByTestId('feed.title-input'), ten);
    await fireEvent.changeText(screen.getByTestId('feed.title-input'), ten + '🙂');
    expect(screen.getByTestId('feed.title-input').props.value).toBe(ten);
  });

  it('TC-FEED-024 TC-FEED-025 저장하면 "저장 중..." 비활성이 되고 PUT은 1회, 성공 뒤 다이얼로그가 닫히고 새 제목이 보인다', async () => {
    const h = await openMine();
    await renderFeed(h);
    await fireEvent.press(screen.getByTestId('feed.edit-title-button'));
    const gate = gated(h.router, PUT_MINE, 'feed/posts-title-update__200');
    await fireEvent.changeText(await screen.findByTestId('feed.title-input'), '새 제목');
    await fireEvent.press(screen.getByTestId('feed.title-save-button'));
    expect(await screen.findByTestId('feed.title-saving')).toBeOnTheScreen();
    expect(screen.getByTestId('feed.title-save-button')).toHaveTextContent(t('feed.edit.saving'));
    expect(screen.getByTestId('feed.title-save-button')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('feed.title-save-button'));
    await act(async () => gate.release());
    await screen.findByTestId('feed.title');
    expect(screen.queryByTestId('feed.title-dialog')).not.toBeOnTheScreen();
    expect(screen.getByTestId('feed.title')).toHaveTextContent('가나다라마바사아자차');
    expect(puts(h)).toHaveLength(1);
    expect(h.toast.messages).toEqual([t('feed.edit.success')]);
  });

  it('TC-FEED-027 저장 실패 시 다이얼로그를 유지하고 실패 문구를 보여 준다', async () => {
    const h = await openMine({ [PUT_MINE]: 'feed/posts-title-update__400-not-editable' });
    await renderFeed(h);
    await fireEvent.press(screen.getByTestId('feed.edit-title-button'));
    await fireEvent.press(await screen.findByTestId('feed.title-save-button'));
    expect(await screen.findByText(t('feed.edit.error.state'))).toBeOnTheScreen();
    expect(screen.getByTestId('feed.title-dialog')).toBeOnTheScreen();
  });
});

describe('FeedScreen 삭제 다이얼로그', () => {
  it('TC-FEED-035 삭제 버튼은 확인창("게시물 삭제" / "게시물을 삭제하시겠어요?" / "삭제")을 열고 취소하면 요청이 없다', async () => {
    const h = await openMine();
    await renderFeed(h);
    await fireEvent.press(screen.getByTestId('feed.delete-button'));
    const dialog = await screen.findByTestId('feed.delete-dialog');
    expect(dialog).toHaveTextContent(t('feed.delete.title'));
    expect(dialog).toHaveTextContent(t('feed.delete.body'));
    expect(screen.getByTestId('feed.delete-confirm-button')).toHaveTextContent(
      t('feed.delete.confirm'),
    );
    expect(screen.getByTestId('feed.delete-cancel-button')).toHaveTextContent(
      t('feed.delete.cancel'),
    );
    await fireEvent.press(screen.getByTestId('feed.delete-cancel-button'));
    expect(screen.queryByTestId('feed.delete-dialog')).not.toBeOnTheScreen();
    expect(h.transport.requests.filter((r) => r.method === 'DELETE')).toEqual([]);
  });

  it('TC-FEED-036 TC-FEED-038 삭제를 확인하면 진행 표시가 나오고 DELETE는 1회, 성공하면 화면을 닫는다', async () => {
    const h = await openMine();
    await renderFeed(h);
    await fireEvent.press(screen.getByTestId('feed.delete-button'));
    const gate = gated(h.router, DELETE_MINE, 'feed/posts-delete__204');
    await fireEvent.press(await screen.findByTestId('feed.delete-confirm-button'));
    expect(await screen.findByTestId('feed.deleting')).toBeOnTheScreen();
    await act(async () => gate.release());
    expect(h.transport.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1);
    expect(h.navigator.closeCount).toBe(1);
    expect(h.toast.messages).toEqual([t('feed.delete.success')]);
  });
});

describe('FeedScreen 좋아요', () => {
  it('TC-LIKE-006 TC-LIKE-034 하트는 selected와 "좋아요 N개" 라벨을 노출하고 알림이 오면 즉시 갱신된다', async () => {
    const h = await openOther();
    await renderFeed(h);
    await screen.findByTestId('feed.date-label');
    // [가정: 접근성 라벨 "좋아요 N개"는 ko.json에 키가 없어 화면이 직접 구성한다]
    expect(screen.getByTestId('feed.like-button').props.accessibilityLabel).toBe('좋아요 38개');
    await fireEvent.press(screen.getByTestId('feed.like-button'));
    expect(h.likes.toggled).toEqual([{ postId: OTHER, likeCount: 38, isLiked: false }]);
    await act(async () =>
      h.likes.emit({ kind: 'updated', snapshot: { postId: OTHER, likeCount: 39, isLiked: true } }),
    );
    expect(screen.getByTestId('feed.like-button')).toBeSelected();
    expect(screen.getByTestId('feed.like-count')).toHaveTextContent('39');
    expect(screen.getByTestId('feed.like-button').props.accessibilityLabel).toBe('좋아요 39개');
  });
});
