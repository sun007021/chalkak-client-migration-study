import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { webOnlyCopy } from '../../copy/webOnly';
import { createFakePhotoEditor } from '../../test/FakePhotoEditor';
import { albumInput, cameraInput, chooseAlbumPhoto, openUploadApp, openUploadScreen } from '../../test/uploadApp';
import { CREATE } from '../../test/uploadHarness';

describe('리뷰 2: 사진 선택·미리보기 접근성', () => {
  it('리뷰 2 앨범·카메라 input에 서로 다른 접근성 이름이 직접 붙는다', async () => {
    await openUploadScreen({ cameraSupported: true });
    expect(albumInput()).toHaveAttribute('aria-label', webOnlyCopy['upload.album.a11y']);
    expect(cameraInput()).toHaveAttribute('aria-label', webOnlyCopy['upload.camera.a11y']);
    expect(webOnlyCopy['upload.album.a11y']).not.toBe(webOnlyCopy['upload.camera.a11y']);
  });

  it('리뷰 2 label에는 접근성 이름을 따로 두지 않는다(input 이름만 읽힌다)', async () => {
    await openUploadScreen({ cameraSupported: true });
    expect(screen.getByTestId('upload.album-button')).not.toHaveAttribute('aria-label');
    expect(screen.getByTestId('upload.camera-button')).not.toHaveAttribute('aria-label');
  });

  it('리뷰 2 input에 키보드 초점이 오면 label에 초점 윤곽선이 생기고 빠지면 사라진다', async () => {
    await openUploadScreen();
    const label = screen.getByTestId('upload.album-button');
    expect(label.style.outline).toBe('');
    act(() => albumInput().focus());
    await waitFor(() => expect(label.style.outline).toContain('solid'));
    act(() => albumInput().blur());
    await waitFor(() => expect(label.style.outline).toBe(''));
  });

  it('리뷰 2 편집기가 붙은 미리보기 버튼은 접근성 이름이 있다', async () => {
    await openUploadScreen({ photoEditor: createFakePhotoEditor().Component });
    await chooseAlbumPhoto();
    fireEvent.click(await screen.findByTestId('photo-edit.done-button'));
    const preview = await screen.findByTestId('upload.photo-preview');
    expect(preview.tagName).toBe('BUTTON');
    expect(preview).toHaveAccessibleName(webOnlyCopy['upload.preview.edit']);
  });

  it('리뷰 2 편집기가 없으면 미리보기 이미지에 대체 텍스트가 있다', async () => {
    await openUploadScreen({ photoEditor: null });
    await chooseAlbumPhoto();
    const preview = await screen.findByTestId('upload.photo-preview');
    expect(preview.querySelector('img')).toHaveAttribute('alt', webOnlyCopy['upload.preview.alt']);
  });

  it('리뷰 2 성공 화면의 사진에 대체 텍스트가 있다', async () => {
    openUploadApp({
      path: '/upload/success',
      beforeRender: (h) => h.container.uploadResults.set({ topicDate: '2026-10-27', topicTitle: '가을 하늘', moderationStatus: 'PENDING', photo: new Blob(['x'], { type: 'image/webp' }) }),
    });
    const root = await screen.findByTestId('upload-success.root');
    await waitFor(() => expect(root.querySelector('img')).toHaveAttribute('alt', webOnlyCopy['upload.success.photo-alt']));
  });
});

describe('리뷰 10: 미리보기 URL과 제출 실패 초점', () => {
  it('리뷰 10 사진을 바꿔도 이미 revoke된 blob URL을 화면이 한 번도 그리지 않는다', async () => {
    const { h } = await openUploadScreen();
    await chooseAlbumPhoto({ name: 'a.jpg' });
    await screen.findByTestId('upload.photo-preview');
    const stale: string[] = [];
    const revoke = h.blobUrls.revoke.bind(h.blobUrls);
    h.blobUrls.revoke = (url: string) => {
      // revoke 시점에 화면이 이 URL의 이미지를 아직 보이고 있으면 한 번 깨진 그림을 그린 것이다.
      if (document.querySelector(`img[src="${url}"]`)) stale.push(url);
      revoke(url);
    };
    await chooseAlbumPhoto({ name: 'b.jpg' });
    await waitFor(() => expect(h.blobUrls.created).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId('upload.photo-preview').querySelector('img')).toHaveAttribute('src', 'blob:fake-2'));
    expect(stale).toEqual([]);
  });

  it('리뷰 10 제출이 실패하면 초점이 오류 문구로 옮겨 간다', async () => {
    await openUploadScreen({ routes: { [CREATE]: 'upload/posts-create__500-server-error' } });
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    fireEvent.click(screen.getByTestId('upload.submit-button'));
    const message = await screen.findByTestId('upload.error-message');
    await waitFor(() => expect(message).toHaveFocus());
  });
});
