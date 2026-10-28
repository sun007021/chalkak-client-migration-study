import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../copy/ko';
import { watchAdded } from '../../test/domWatch';
import { MINE, OTHER, titleKey } from '../../test/postRoutes';
import { advance, openApp } from '../../test/postScreens';
import type { PostSeed } from '../post/postModels';

const tid = (id: string) => screen.getByTestId(id);
const seedMine: PostSeed = {
  id: MINE,
  authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  originalImageUrl: `https://cdn.example.test/posts/${MINE}/original.webp`,
  thumbnailImageUrl: `https://cdn.example.test/posts/${MINE}/thumbnail.webp`,
  title: '비 오는 날',
  likeCount: 10,
  isLiked: false,
  isMine: true,
};
const openMine = async () => {
  const view = await openApp({ path: { pathname: `/feed/${MINE}`, state: { seed: seedMine } } });
  await waitFor(() => expect(tid('feed.like-button')).toBeEnabled());
  return view;
};

describe('상세 다이얼로그 접근성 (코드리뷰 2)', () => {
  it('제목 수정: 입력에 포커스, label 연결, Esc로 닫고 트리거로 포커스가 돌아온다', async () => {
    await openMine();
    const trigger = tid('feed.edit-title-button');
    trigger.focus();
    fireEvent.click(trigger);
    const input = await screen.findByLabelText(t('feed.edit.title'), { selector: 'input' });
    expect(input).toBe(tid('feed.title-input'));
    expect(document.activeElement).toBe(input);
    expect(tid('feed.title-dialog')).toHaveAccessibleName(t('feed.edit.title'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('feed.title-dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });

  it('제목 수정: Enter(폼 제출)로 저장하고 배경은 inert다', async () => {
    const { fixtures } = await openMine();
    fireEvent.click(tid('feed.edit-title-button'));
    const input = await screen.findByTestId('feed.title-input');
    expect(tid('feed.back-button').closest('[inert]')).not.toBeNull();
    const user = userEvent.setup({ advanceTimers: () => undefined });
    await user.clear(input);
    await user.type(input, '새 제목{Enter}');
    await waitFor(() => expect(fixtures.calls(titleKey(MINE))).toHaveLength(1));
    expect(JSON.parse(fixtures.calls(titleKey(MINE))[0]!.body as string)).toEqual({ title: '새 제목' });
    await waitFor(() => expect(screen.queryByTestId('feed.title-dialog')).not.toBeInTheDocument());
    expect(tid('feed.back-button').closest('[inert]')).toBeNull();
  });

  it('Tab은 다이얼로그 안에서만 돈다', async () => {
    await openMine();
    fireEvent.click(tid('feed.edit-title-button'));
    await screen.findByTestId('feed.title-dialog');
    tid('feed.title-save-button').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(tid('feed.title-input'));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(tid('feed.title-save-button'));
  });

  it('삭제 확인: 처음 포커스는 취소 버튼이고 Esc로 닫으면 요청이 없다', async () => {
    const { fixtures } = await openMine();
    const trigger = tid('feed.delete-button');
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByTestId('feed.delete-dialog');
    expect(document.activeElement).toBe(tid('feed.delete-cancel-button'));
    expect(tid('feed.delete-dialog')).toHaveAccessibleDescription(t('feed.delete.body'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('feed.delete-dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
    expect(fixtures.calls(`DELETE /posts/${MINE}`)).toHaveLength(0);
  });
});

describe('상세 제목 수정 중 자정 (코드리뷰 3, REQ-FEED-017)', () => {
  it('다이얼로그가 열린 채 자정을 지나 저장하면 요청 없이 오류를 보이고 다이얼로그·입력을 유지한다', async () => {
    const { fixtures, h } = await openMine();
    fireEvent.click(tid('feed.edit-title-button'));
    fireEvent.change(await screen.findByTestId('feed.title-input'), { target: { value: '새 제목' } });
    await advance(h, 12 * 3600 * 1000); // 하네스 시계는 KST 12:00: 자정
    fireEvent.click(tid('feed.title-save-button'));
    expect(await screen.findByText(t('feed.edit.error.state'))).toBeInTheDocument();
    expect(tid('feed.title-input')).toHaveValue('새 제목');
    expect(fixtures.calls(titleKey(MINE))).toHaveLength(0);
  });
});

describe('상세 첫 프레임 (코드리뷰 12)', () => {
  it('시드로 열면 로딩 표시가 한 번도 그려지지 않는다', async () => {
    const loading = watchAdded('feed.loading');
    await openApp({ path: { pathname: `/feed/${OTHER}`, state: { seed: { ...seedMine, id: OTHER, isMine: false } } } });
    await screen.findByTestId('feed.title');
    expect(loading.seen()).toBe(false);
    loading.stop();
  });
});

describe('사진 확대 입력 (코드리뷰 5)', () => {
  it('Ctrl+휠은 브라우저 확대를 막고(preventDefault) 배율을 올린다. Ctrl 없는 휠은 건드리지 않는다', async () => {
    await openMine();
    const photo = tid('feed.photo');
    const plain = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    act(() => void photo.dispatchEvent(plain));
    expect(plain.defaultPrevented).toBe(false);
    const ctrl = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    act(() => void photo.dispatchEvent(ctrl));
    expect(ctrl.defaultPrevented).toBe(true);
    expect(tid('feed.photo-content').style.transform).toMatch(/scale\(2\.7/);
  });

  it('포인터가 취소·캡처 상실로 끝나도 원래 크기로 돌아온다', async () => {
    await openMine();
    const photo = tid('feed.photo');
    const wheel = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    act(() => void photo.dispatchEvent(wheel));
    expect(tid('feed.photo-content').style.transform).not.toMatch(/scale\(1\)/);
    fireEvent.pointerDown(photo, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(photo, { pointerId: 1 });
    expect(tid('feed.photo-content').style.transform).toMatch(/scale\(1\)/);
    act(() => void photo.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })));
    fireEvent.pointerDown(photo, { pointerId: 2, clientX: 0, clientY: 0 });
    expect(tid('feed.photo-content').style.transform).toMatch(/scale\(2\.7/);
    fireEvent.lostPointerCapture(photo, { pointerId: 2 });
    expect(tid('feed.photo-content').style.transform).toMatch(/scale\(1\)/);
  });
});
