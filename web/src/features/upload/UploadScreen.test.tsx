import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { emptyResponse } from '../../test/fakeFetch';
import { createFakePhotoEditor } from '../../test/FakePhotoEditor';
import { imageFile } from '../../test/FakeImageDecoder';
import { json } from '../../test/fixtureRouter';
import { screenViews } from '../../test/screenViews';
import { advance, albumInput, cameraInput, chooseAlbumPhoto, openUploadApp, openUploadScreen, toastText } from '../../test/uploadApp';
import { CREATE, POLICY, REFRESH, TOPICS, UPLOAD_ID, createBody, putKey, settleMore } from '../../test/uploadHarness';
import { IDENTITY_EDIT } from './editModel';

const submitButton = () => screen.getByTestId('upload.submit-button');
const errorMessage = () => screen.queryByTestId('upload.error-message')?.textContent ?? null;
const titleInput = () => screen.getByTestId('upload.title-input') as HTMLInputElement;
const puts = (h: { ff: { calls: { method: string }[] } }) => h.ff.calls.filter((c) => c.method === 'PUT');

async function typeTitle(value: string) {
  await act(async () => {
    fireEvent.change(titleInput(), { target: { value } });
  });
}

describe('업로드 화면 구성 (REQ-UPL-012~013, 060)', () => {
  it('TC-UPL-089 주제 제목, 안내 문구, 제목 입력 플레이스홀더, 앨범 버튼이 보이고 전시하기는 사진 전에는 비활성이다', async () => {
    await openUploadScreen();
    expect(screen.getByTestId('upload.topic-title')).toHaveTextContent('주제 ‘가을 하늘’에 맞는 한 장');
    expect(screen.getByTestId('upload.topic-title')).toHaveTextContent(t('upload.heading', { 주제: '가을 하늘' }));
    expect(screen.getByTestId('upload.guide-text')).toHaveTextContent('앨범에서 고르거나 지금 찍어요');
    expect(titleInput()).toHaveAttribute('placeholder', '작품 제목은 선택이에요.');
    expect(screen.getByTestId('upload.album-button')).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('전시하기');
    expect(submitButton()).toBeDisabled();
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload.close-button')).toBeInTheDocument();
  });

  it('TC-UPL-014 앨범 입력은 이미지 한 장만 받는 file input이다(권한 불필요)', async () => {
    await openUploadScreen();
    const input = albumInput();
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(false);
    expect(input.hasAttribute('capture')).toBe(false);
  });

  it('TC-UPL-015 카메라를 쓸 수 없는 환경(데스크톱)에서는 카메라 버튼이 없고 앨범은 가능하다', async () => {
    await openUploadScreen();
    expect(screen.queryByTestId('upload.camera-button')).not.toBeInTheDocument();
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
  });

  it('TC-UPL-015 카메라를 쓸 수 있는 환경이면 카메라 버튼(capture 입력)이 보인다', async () => {
    await openUploadScreen({ cameraSupported: true });
    const input = cameraInput();
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.hasAttribute('capture')).toBe(true);
    expect(input.multiple).toBe(false);
  });

  it('TC-UPL-088 화면을 열면 screen_view photo_upload가 1회 전송된다', async () => {
    const { h } = await openUploadScreen();
    expect(screenViews(h.tracker).filter((name) => name === 'photo_upload')).toHaveLength(1);
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    expect(screenViews(h.tracker).filter((name) => name === 'photo_upload')).toHaveLength(1);
  });

  it('TC-UPL-088 StrictMode의 이중 마운트에서도 screen_view는 1회다', async () => {
    const { h } = await openUploadScreen({ strict: true });
    expect(screenViews(h.tracker).filter((name) => name === 'photo_upload')).toHaveLength(1);
  });
});

describe('주제 조회 실패 (REQ-UPL-010)', () => {
  it('TC-UPL-012 주제를 받지 못하면 오류 표시와 다시 시도 버튼이 보이고, 누르면 주제만 다시 받는다', async () => {
    const app = openUploadApp({ path: { pathname: '/upload', state: { topicDate: '2026-10-27' } }, routes: { [TOPICS]: () => json(404, { errorCode: 'BUSINESS_ERROR', message: '주제를 찾을 수 없습니다.' }) } });
    expect(await screen.findByTestId('upload.error-state')).toHaveTextContent(t('upload.error.topic-load'));
    expect(screen.queryByTestId('upload.topic-title')).not.toBeInTheDocument();
    app.routes.set(TOPICS, 'home/topics__open-2026-10-27');
    fireEvent.click(screen.getByTestId('upload.retry-button'));
    await waitFor(() => expect(screen.getByTestId('upload.topic-title')).toHaveTextContent('가을 하늘'));
    expect(screen.queryByTestId('upload.error-state')).not.toBeInTheDocument();
  });

  it('TC-UPL-012 연결 실패는 네트워크 문구다', async () => {
    const app = openUploadApp({ path: { pathname: '/upload', state: { topicDate: '2026-10-27' } }, routes: { [TOPICS]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    await screen.findByTestId('upload.root');
    await advance(app.h, 1_500);
    expect(await screen.findByTestId('upload.error-state')).toHaveTextContent(t('upload.error.network'));
  });
});

describe('사진 선택·미리보기 (REQ-UPL-014~021, 035)', () => {
  it('TC-UPL-089 사진을 고르면 원본 비율로 미리보기가 보이고 전시하기가 활성이 된다', async () => {
    const { h } = await openUploadScreen();
    await chooseAlbumPhoto({ width: 3000, height: 4000 });
    const preview = await screen.findByTestId('upload.photo-preview');
    expect(preview.style.aspectRatio.replace(/\s/g, '')).toBe('3000/4000');
    expect(h.blobUrls.created).toHaveLength(1);
    expect(submitButton()).toBeEnabled();
  });

  it('TC-UPL-089 가로 사진은 가로 비율이다', async () => {
    await openUploadScreen();
    await chooseAlbumPhoto({ width: 4000, height: 3000 });
    const preview = await screen.findByTestId('upload.photo-preview');
    expect(preview.style.aspectRatio.replace(/\s/g, '')).toBe('4000/3000');
  });

  it('TC-UPL-047 TC-UPL-023 준비 중에는 준비 표시가 보이지만 전시하기는 활성이고, 끝나면 표시가 사라진다', async () => {
    const { h } = await openUploadScreen();
    const gate = h.compressor.hold();
    await chooseAlbumPhoto();
    expect(await screen.findByTestId('upload.preparing-indicator')).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    await act(async () => {
      gate.resolve();
      await settleMore();
    });
    await waitFor(() => expect(screen.queryByTestId('upload.preparing-indicator')).not.toBeInTheDocument());
    expect(submitButton()).toBeEnabled();
  });

  it('TC-UPL-021 손상된 사진은 미리보기 없이 준비 실패 문구를 보이고 전시하기는 비활성이다', async () => {
    await openUploadScreen();
    await chooseAlbumPhoto({ corrupt: true });
    await waitFor(() => expect(errorMessage()).toBe('사진을 준비하지 못했어요. 다시 시도해 주세요.'));
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('TC-UPL-021 0바이트 사진도 같다', async () => {
    await openUploadScreen();
    await chooseAlbumPhoto({ bytes: 0 });
    await waitFor(() => expect(errorMessage()).toBe(t('upload.error.prepare')));
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeInTheDocument();
  });

  it('TC-UPL-028 다른 사진을 고르면 미리보기가 바뀌고 정책을 새로 받는다', async () => {
    const { h } = await openUploadScreen({ routes: { [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'] } });
    await chooseAlbumPhoto({ width: 4000, height: 3000 });
    await screen.findByTestId('upload.photo-preview');
    await chooseAlbumPhoto({ width: 1000, height: 2000 });
    await waitFor(() => expect(screen.getByTestId('upload.photo-preview').style.aspectRatio.replace(/\s/g, '')).toBe('1000/2000'));
    await waitFor(() => expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(2));
  });

  it('TC-UPL-014 카메라 입력으로 고른 사진도 같은 흐름이다', async () => {
    const { h } = await openUploadScreen({ cameraSupported: true });
    const file = imageFile({ name: 'camera.jpg' });
    await act(async () => {
      fireEvent.change(cameraInput(), { target: { files: [file] } });
    });
    await screen.findByTestId('upload.photo-preview');
    expect(h.decoder.calls[0]!.source).toBe(file);
  });

  it('TC-UPL-014 선택기를 취소해(파일 없음) 아무것도 고르지 않으면 상태가 바뀌지 않는다', async () => {
    await openUploadScreen();
    await act(async () => {
      fireEvent.change(albumInput(), { target: { files: [] } });
    });
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeInTheDocument();
    expect(errorMessage()).toBeNull();
  });
});

describe('제목 입력 (REQ-UPL-022~024)', () => {
  it('TC-UPL-080 한글 11자를 넣으면 10자까지만 남고 글자 수가 10/10이다', async () => {
    await openUploadScreen();
    await typeTitle('가나다라마바사아자차카');
    expect(titleInput().value).toBe('가나다라마바사아자차');
    expect(screen.getByTestId('upload.title-counter').textContent?.replace(/\s/g, '')).toBe('10/10');
  });

  it('TC-UPL-080 글자 수는 입력에 따라 바뀐다', async () => {
    await openUploadScreen();
    expect(screen.getByTestId('upload.title-counter').textContent?.replace(/\s/g, '')).toBe('0/10');
    await typeTitle('하늘');
    expect(screen.getByTestId('upload.title-counter').textContent?.replace(/\s/g, '')).toBe('2/10');
  });

  it('TC-UPL-081 이모지 11개를 붙여넣으면 10 code point까지만 들어간다', async () => {
    await openUploadScreen();
    await typeTitle('😀'.repeat(11));
    expect(titleInput().value).toBe('😀'.repeat(10));
  });

  it('TC-UPL-082 앞뒤 공백은 글자 수에 넣지 않는다', async () => {
    await openUploadScreen();
    await typeTitle(' 가나다라마바사아자차 ');
    expect(titleInput().value).toBe(' 가나다라마바사아자차 ');
    expect(screen.getByTestId('upload.title-counter').textContent?.replace(/\s/g, '')).toBe('10/10');
  });
});

describe('제출 (REQ-UPL-039~053)', () => {
  it('TC-UPL-048 TC-UPL-073 누르면 "전시 중..."과 제출 표시가 보이고(재탭 무시) 끝나면 성공 화면으로 replace 이동한다', async () => {
    const { h, routes, router } = await openUploadScreen();
    await chooseAlbumPhoto();
    await typeTitle('하늘');
    await screen.findByTestId('upload.photo-preview');
    const gate = deferred<Response>();
    routes.set(putKey(UPLOAD_ID), () => gate.promise);
    fireEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toHaveTextContent('전시 중...'));
    expect(submitButton()).toHaveTextContent(t('upload.submitting'));
    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId('upload.submitting-indicator')).toBeInTheDocument();
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());
    await act(async () => {
      gate.resolve(emptyResponse(200));
      await settleMore();
    });
    await screen.findByTestId('upload-success.root');
    expect(router.state.location.pathname).toBe('/upload/success');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(puts(h)).toHaveLength(1);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
    expect(createBody(h)).toMatchObject({ title: '하늘', photoUploadId: UPLOAD_ID });
  });

  it('TC-UPL-048 준비 중에 눌러도 준비가 끝나면 자동으로 PUT·POST까지 진행한다', async () => {
    const { h } = await openUploadScreen();
    const gate = h.compressor.hold();
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.preparing-indicator');
    fireEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toHaveTextContent('전시 중...'));
    expect(puts(h)).toHaveLength(0);
    await act(async () => {
      gate.resolve();
      await settleMore();
    });
    await screen.findByTestId('upload-success.root');
    expect(puts(h)).toHaveLength(1);
  });

  it('TC-UPL-068 TC-UPL-074 POST /posts 500이면 오류 문구가 보이고 입력은 유지되며 다시 누를 수 있다', async () => {
    const { h } = await openUploadScreen({ routes: { [CREATE]: ['upload/posts-create__500-server-error', 'upload/posts-create__201-pending'] } });
    await chooseAlbumPhoto();
    await typeTitle('하늘');
    await screen.findByTestId('upload.photo-preview');
    fireEvent.click(submitButton());
    await waitFor(() => expect(errorMessage()).toBe('전시를 완료하지 못했어요. 다시 시도해 주세요.'));
    expect(titleInput().value).toBe('하늘');
    expect(screen.getByTestId('upload.photo-preview')).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('전시하기');
    expect(screen.queryByTestId('upload.submitting-indicator')).not.toBeInTheDocument();
    expect(toastText()).toBeNull();
    fireEvent.click(submitButton());
    await screen.findByTestId('upload-success.root');
    expect(h.ff.callsTo('POST /posts')).toHaveLength(2);
  });

  it('TC-UPL-062 400 뒤 오늘 이미 작성이면 "이미 이 주제에 전시한 사진이 있어요."를 보인다', async () => {
    await openUploadScreen({ routes: { [CREATE]: 'upload/posts-create__400-already-posted', 'GET /posts/today': 'home/posts-today__posted-pending' } });
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    fireEvent.click(submitButton());
    await waitFor(() => expect(errorMessage()).toBe('이미 이 주제에 전시한 사진이 있어요.'));
  });

  it('TC-UPL-055 업로드(PUT) 실패 문구가 보이고 입력은 유지된다', async () => {
    await openUploadScreen({ routes: { [putKey(UPLOAD_ID)]: 'upload/s3-put__403-signature-mismatch' } });
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    fireEvent.click(submitButton());
    await waitFor(() => expect(errorMessage()).toBe('사진을 업로드하지 못했어요. 다시 시도해 주세요.'));
    expect(screen.getByTestId('upload.photo-preview')).toBeInTheDocument();
  });

  it('TC-UPL-067 정지 회원(POST /posts 403) 안내가 보인다', async () => {
    await openUploadScreen({ routes: { [CREATE]: 'upload/posts-create__403-banned' } });
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    fireEvent.click(submitButton());
    await waitFor(() => expect(errorMessage()).toBe('이용이 정지되어 게시물을 작성할 수 없어요.'));
  });

  it('TC-UPL-066 TC-UPL-078 재인증이 필요하면(POST /posts 401) 문구 없이 로그인 화면으로 이동한다', async () => {
    const { router } = await openUploadScreen({ routes: { [CREATE]: 'upload/posts-create__401-unauthorized', [REFRESH]: 'auth/refresh__reauthentication-required' } });
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    fireEvent.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('TC-UPL-053 사진 입력과 전시하기는 제출 중에 잠긴다(앨범 입력 변경 무시)', async () => {
    const { h, routes } = await openUploadScreen();
    await chooseAlbumPhoto({ width: 3000, height: 4000 });
    await screen.findByTestId('upload.photo-preview');
    routes.set(putKey(UPLOAD_ID), () => new Promise<Response>(() => undefined));
    fireEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toHaveTextContent('전시 중...'));
    const decodes = h.decoder.decodeCount;
    await chooseAlbumPhoto({ width: 100, height: 100 });
    expect(h.decoder.decodeCount).toBe(decodes);
    expect(screen.getByTestId('upload.photo-preview').style.aspectRatio.replace(/\s/g, '')).toBe('3000/4000');
  });
});

describe('닫기·이탈 (REQ-UPL-012, 054, TC-UPL-079)', () => {
  it('TC-UPL-090 앱 안에서 push로 들어왔으면 닫기는 뒤로 가기다(버튼을 누른 화면으로)', async () => {
    const app = openUploadApp({ path: '/home' });
    await screen.findByTestId('home.root');
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    await screen.findByTestId('upload.root');
    fireEvent.click(screen.getByTestId('upload.close-button'));
    await screen.findByTestId('home.root');
    expect(app.router.state.location.pathname).toBe('/home');
    expect(app.router.state.historyAction).toBe('POP');
  });

  it('TC-UPL-090 새로고침 등으로 첫 항목이면 닫기는 홈으로 replace한다', async () => {
    const { router } = await openUploadScreen();
    fireEvent.click(screen.getByTestId('upload.close-button'));
    await screen.findByTestId('home.root');
    expect(router.state.location.pathname).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('TC-UPL-079 PUT 중에 닫으면 PUT을 취소하고 POST /posts 없이 성공 화면도 뜨지 않는다', async () => {
    const { h, routes, router } = await openUploadScreen();
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    const gate = deferred<Response>();
    routes.set(putKey(UPLOAD_ID), () => gate.promise);
    fireEvent.click(submitButton());
    await waitFor(() => expect(puts(h)).toHaveLength(1));
    const signal = h.ff.calls.find((c) => c.method === 'PUT')!.signal;
    fireEvent.click(screen.getByTestId('upload.close-button'));
    await screen.findByTestId('home.root');
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      gate.resolve(emptyResponse(200));
      await settleMore();
    });
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/home');
    expect(screen.queryByTestId('upload-success.root')).not.toBeInTheDocument();
  });

  it('TC-UPL-031 준비 중에 닫으면 진행 중인 압축을 취소한다', async () => {
    const { h } = await openUploadScreen();
    h.compressor.hold();
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.preparing-indicator');
    const signal = h.compressor.calls[0]!.signal;
    fireEvent.click(screen.getByTestId('upload.close-button'));
    await screen.findByTestId('home.root');
    expect(signal.aborted).toBe(true);
  });

  it('TC-UPL-079 화면을 떠날 때 미리보기 blob URL을 해제한다', async () => {
    const { h } = await openUploadScreen();
    await chooseAlbumPhoto();
    await screen.findByTestId('upload.photo-preview');
    fireEvent.click(screen.getByTestId('upload.close-button'));
    await screen.findByTestId('home.root');
    expect(h.blobUrls.revoked.length).toBeGreaterThanOrEqual(h.blobUrls.created.length);
    expect(h.blobUrls.created.length).toBeGreaterThan(0);
  });
});

describe('편집기 연결점 (편집기 본체는 W7b)', () => {
  it('편집기가 없으면(W7a) 미리보기를 눌러도 편집기가 열리지 않는다', async () => {
    await openUploadScreen();
    await chooseAlbumPhoto();
    fireEvent.click(await screen.findByTestId('upload.photo-preview'));
    expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument();
  });

  it('TC-UPL-014 편집기가 있으면 사진을 고를 때 편집기가 열리고 확정 전에는 미리보기·정책 요청이 없다', async () => {
    const editor = createFakePhotoEditor();
    const { h } = await openUploadScreen({ photoEditor: editor.Component });
    const file = await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.root');
    expect(editor.probe.opens).toHaveLength(1);
    expect(editor.probe.opens[0]!.source).toBe(file);
    expect(editor.probe.opens[0]!.initialEdit).toEqual(IDENTITY_EDIT);
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeInTheDocument();
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(0);
  });

  it('TC-UPL-023 편집기에서 완료하면 닫히고 미리보기가 보이며 준비를 시작한다', async () => {
    const editor = createFakePhotoEditor();
    const { h } = await openUploadScreen({ photoEditor: editor.Component });
    await chooseAlbumPhoto();
    fireEvent.click(await screen.findByTestId('photo-edit.done-button'));
    await screen.findByTestId('upload.photo-preview');
    expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument();
    await waitFor(() => expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1));
  });

  it('편집기에서 취소하면 선택이 취소된다', async () => {
    const editor = createFakePhotoEditor();
    const { h } = await openUploadScreen({ photoEditor: editor.Component });
    await chooseAlbumPhoto();
    fireEvent.click(await screen.findByTestId('photo-edit.cancel-button'));
    await waitFor(() => expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument());
    expect(screen.queryByTestId('upload.photo-preview')).not.toBeInTheDocument();
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(0);
  });

  it('미리보기를 누르면 확정한 편집값으로 편집기가 다시 열리고, 같은 값으로 완료하면 다시 준비하지 않는다', async () => {
    const editor = createFakePhotoEditor();
    const { h } = await openUploadScreen({ photoEditor: editor.Component });
    await chooseAlbumPhoto();
    fireEvent.click(await screen.findByTestId('photo-edit.done-button'));
    fireEvent.click(await screen.findByTestId('upload.photo-preview'));
    await screen.findByTestId('photo-edit.root');
    expect(editor.probe.opens).toHaveLength(2);
    expect(editor.probe.opens[1]!.initialEdit).toEqual(IDENTITY_EDIT);
    fireEvent.click(screen.getByTestId('photo-edit.done-button'));
    await waitFor(() => expect(screen.queryByTestId('photo-edit.root')).not.toBeInTheDocument());
    await act(async () => settleMore());
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
  });

  it('편집기가 열려 있는 동안은 전시하기를 누를 수 없다', async () => {
    const editor = createFakePhotoEditor();
    await openUploadScreen({ photoEditor: editor.Component });
    await chooseAlbumPhoto();
    await screen.findByTestId('photo-edit.root');
    const button = screen.queryByTestId('upload.submit-button') as HTMLButtonElement | null;
    expect(button === null || button.disabled).toBe(true);
  });
});

