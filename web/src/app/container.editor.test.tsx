import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InProcessRefreshLock } from '../core/auth/RefreshLock';
import { createAppContainer } from './container';
import { CanvasEditRenderer } from '../features/upload/editor/CanvasEditRenderer';
import { IdentityEditRenderer } from '../features/upload/imagePorts';
import { IDENTITY_EDIT } from '../features/upload/editModel';
import { makeHarness } from '../test/appHarness';
import { FakeAutoAnalyzer } from '../test/FakeAutoAnalyzer';
import { FakeClock } from '../test/FakeClock';
import { FakeEditRenderer } from '../test/FakeEditRenderer';
import { FakeImageDecoder, imageFile } from '../test/FakeImageDecoder';
import { FakePreviewRenderer } from '../test/FakePreviewRenderer';
import { FakeSessionStore } from '../test/FakeSessionStore';
import { FakeFetch } from '../test/fakeFetch';
import { memberSession } from '../test/fixtures';
import { SequentialIdGenerator } from '../test/sequentialIds';
import { chooseAlbumPhoto, openUploadScreen } from '../test/uploadApp';
import { POLICY, settleMore } from '../test/uploadHarness';

const baseOptions = () => ({
  env: {},
  pageOrigin: 'https://app.test',
  fetch: new FakeFetch().fetch,
  clock: new FakeClock(),
  store: new FakeSessionStore(),
  lock: new InProcessRefreshLock(),
  ids: new SequentialIdGenerator(),
});

const click = async (testId: string) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
  await act(async () => settleMore());
};

describe('앱 조립: 사진 편집기 (container.photoEditor, W7b)', () => {
  it('W7b photoEditor를 지정하지 않으면 실제 편집기 컴포넌트가 꽂힌다(W7a의 null이 아니다)', () => {
    const container = createAppContainer(baseOptions());
    expect(container.photoEditor).not.toBeNull();
    expect(typeof container.photoEditor).toBe('function');
  });

  it('명시적으로 null을 주면 편집기가 없다(고른 사진은 편집하지 않은 값으로 바로 확정, W7a 경로)', () => {
    expect(createAppContainer({ ...baseOptions(), photoEditor: null }).photoEditor).toBeNull();
  });

  it('REQ-EDIT-002 업로드 준비가 쓰는 편집값 적용은 기본 CanvasEditRenderer이고 주입하면 그것을 쓴다', () => {
    const real = createAppContainer(baseOptions());
    expect(real.editRenderer).toBeInstanceOf(CanvasEditRenderer);
    expect(real.editRenderer).not.toBeInstanceOf(IdentityEditRenderer);
    const fake = new FakeEditRenderer();
    expect(createAppContainer({ ...baseOptions(), editRenderer: fake }).editRenderer).toBe(fake);
  });

  it('실제 편집기는 컨테이너에 주입한 디코더·미리보기·분석기로 동작한다', async () => {
    const decoder = new FakeImageDecoder();
    const previewRenderer = new FakePreviewRenderer();
    const autoAnalyzer = new FakeAutoAnalyzer();
    const container = createAppContainer({ ...baseOptions(), imageDecoder: decoder, previewRenderer, autoAnalyzer });
    const Editor = container.photoEditor!;
    const source = imageFile();
    render(<Editor source={source} initialEdit={IDENTITY_EDIT} onConfirm={() => undefined} onCancel={() => undefined} />);
    await act(async () => settleMore());
    expect(decoder.calls.map((c) => c.source)).toEqual([source]);
    expect(previewRenderer.calls.length).toBeGreaterThan(0);
    expect(autoAnalyzer.calls).toHaveLength(1);
    expect(screen.getByTestId('photo-edit.root')).toBeInTheDocument();
  });

  it('테스트 하니스의 realEditor는 photoEditor 기본값(실제 편집기)을 쓴다', () => {
    expect(makeHarness({ session: memberSession(), realEditor: true }).container.photoEditor).not.toBeNull();
    expect(makeHarness({ session: memberSession() }).container.photoEditor).toBeNull();
  });
});

describe('업로드 화면 + 실제 편집기 흐름 (TC-EDIT-004~006, 011)', () => {
  const policyCalls = (h: { ff: { callsTo(key: string): unknown[] } }) => h.ff.callsTo(POLICY).length;

  it('TC-EDIT-004 처음 고른 사진의 편집을 취소하면 렌더·정책 요청 없이 사진 선택 자체가 취소된다', async () => {
    const { h } = await openUploadScreen({ realEditor: true });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.cancel-button');
    await waitFor(() => expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument());
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeInTheDocument();
    expect(policyCalls(h)).toBe(0);
    expect(h.renderer.calls).toHaveLength(0);
  });

  it('TC-EDIT-011 편집하지 않고 완료하면 업로드 준비는 편집 재그리기(EditRenderer)를 건너뛴다', async () => {
    const { h } = await openUploadScreen({ realEditor: true });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.done-button');
    await screen.findByTestId('upload.photo-preview');
    await act(async () => settleMore());
    expect(policyCalls(h)).toBe(1);
    expect(h.renderer.calls).toHaveLength(0);
  });

  it('TC-EDIT-003 필터를 고르고 완료하면 업로드 준비가 같은 편집값으로 한 번 다시 그린다', async () => {
    const { h } = await openUploadScreen({ realEditor: true });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.tab-filter');
    await click('photo-edit.filter-warm');
    await click('photo-edit.done-button');
    await screen.findByTestId('upload.photo-preview');
    await act(async () => settleMore());
    expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument();
    expect(policyCalls(h)).toBe(1);
    expect(h.renderer.calls).toHaveLength(1);
    expect(h.renderer.calls[0]!.edit.filter).toBe('warm');
  });

  it('TC-EDIT-006 사진을 탭하면 현재 편집값(필터)이 복원된 채 편집기가 다시 열리고, 같은 값으로 완료하면 다시 준비하지 않는다', async () => {
    const { h } = await openUploadScreen({ realEditor: true });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.tab-filter');
    await click('photo-edit.filter-warm');
    await click('photo-edit.done-button');
    await click('upload.photo-preview');
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.tab-filter');
    expect(screen.getByTestId('photo-edit.filter-warm')).toHaveAttribute('aria-checked', 'true');
    await click('photo-edit.done-button');
    await waitFor(() => expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument());
    await act(async () => settleMore());
    expect(policyCalls(h)).toBe(1);
    expect(h.renderer.calls).toHaveLength(1);
  });

  it('TC-EDIT-006 다른 편집값으로 다시 완료하면 이전 준비를 버리고 새 정책 발급부터 다시 준비한다', async () => {
    const { h } = await openUploadScreen({ realEditor: true });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.done-button');
    await click('upload.photo-preview');
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.tab-filter');
    await click('photo-edit.filter-vivid');
    await click('photo-edit.done-button');
    await waitFor(() => expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument());
    await act(async () => settleMore());
    expect(policyCalls(h)).toBe(2);
    expect(h.renderer.calls.at(-1)!.edit.filter).toBe('vivid');
  });

  it('TC-EDIT-005 다시 편집하던 사진의 취소는 이전 선택·편집 결과·준비 결과를 유지한다', async () => {
    const { h } = await openUploadScreen({ realEditor: true });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.tab-filter');
    await click('photo-edit.filter-warm');
    await click('photo-edit.done-button');
    await screen.findByTestId('upload.photo-preview');
    await act(async () => settleMore());
    await click('upload.photo-preview');
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.tab-filter');
    await click('photo-edit.filter-mono');
    await click('photo-edit.cancel-button');
    await waitFor(() => expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument());
    expect(screen.getByTestId('upload.photo-preview')).toBeInTheDocument();
    expect(policyCalls(h)).toBe(1);
    expect(h.renderer.calls).toHaveLength(1);
    // 편집값도 그대로: 다시 열면 흑백이 아니라 따뜻하게가 선택되어 있다
    await click('upload.photo-preview');
    await screen.findByTestId('photo-edit.preview-image');
    await click('photo-edit.tab-filter');
    expect(screen.getByTestId('photo-edit.filter-warm')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('photo-edit.filter-mono')).toHaveAttribute('aria-checked', 'false');
  });

  it('편집기가 열려 있는 동안 "전시하기"는 누를 수 없다', async () => {
    await openUploadScreen({ realEditor: true });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.root');
    const submit = screen.queryByTestId('upload.submit-button') as HTMLButtonElement | null;
    expect(submit === null || submit.disabled).toBe(true);
  });
});
