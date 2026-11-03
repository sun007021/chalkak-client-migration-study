import { fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../copy/ko';
import { imageFile } from '../../test/FakeImageDecoder';
import { screenViews } from '../../test/screenViews';
import { openUploadApp } from '../../test/uploadApp';
import type { UploadApp } from '../../test/uploadApp';
import type { UploadResult } from './UploadResult';

const result = (overrides: Partial<UploadResult> = {}): UploadResult => ({
  topicDate: '2026-10-27',
  topicTitle: '가을 하늘',
  moderationStatus: 'PENDING',
  photo: new Blob(['x'], { type: 'image/webp' }),
  ...overrides,
});

function openSuccess(value: UploadResult | null = result(), path = '/upload/success'): UploadApp {
  return openUploadApp({
    path,
    beforeRender: (h) => {
      if (value) h.container.uploadResults.set(value);
    },
  });
}

describe('업로드 성공 화면 (REQ-UPL-060~063)', () => {
  it('TC-UPL-085 PENDING이면 검수 대기 안내와 "확인했어요." 버튼이 보인다', async () => {
    openSuccess(result({ moderationStatus: 'PENDING' }));
    await screen.findByTestId('upload-success.root');
    expect(screen.getByTestId('upload-success.status-message')).toHaveTextContent('검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!');
    expect(screen.getByTestId('upload-success.status-message')).toHaveTextContent(t('upload.success.pending'));
    expect(screen.getByTestId('upload-success.confirm-button')).toHaveTextContent('확인했어요.');
  });

  it('TC-UPL-085 VALIDATING이면 확인 중 안내가 보인다', async () => {
    openSuccess(result({ moderationStatus: 'VALIDATING' }));
    await screen.findByTestId('upload-success.root');
    expect(screen.getByTestId('upload-success.status-message')).toHaveTextContent('사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!');
  });

  it('TC-UPL-085 복구 확인으로 APPROVED가 온 경우에도 안내와 버튼은 보인다(검수 안내는 보이지 않는다)', async () => {
    openSuccess(result({ moderationStatus: 'APPROVED' }));
    await screen.findByTestId('upload-success.root');
    expect(screen.getByTestId('upload-success.confirm-button')).toBeInTheDocument();
    expect(screen.getByTestId('upload-success.message')).toBeInTheDocument();
    expect(screen.queryByTestId('upload-success.status-message')?.textContent ?? '').not.toContain(t('upload.success.pending'));
  });

  it.each([
    ['하늘', '‘하늘’을 기록했어요.'],
    ['꽃', '‘꽃’을 기록했어요.'],
    ['우산', '‘우산’을 기록했어요.'],
    ['바다', '‘바다’를 기록했어요.'],
    ['나무', '‘나무’를 기록했어요.'],
  ])('TC-UPL-084 주제 %s 의 기록 문장은 %s 이다', async (title, sentence) => {
    openSuccess(result({ topicTitle: title }));
    await screen.findByTestId('upload-success.root');
    expect(screen.getByTestId('upload-success.message')).toHaveTextContent(sentence);
  });

  it('TC-UPL-084 주제 끝 공백은 무시한다("겨울 " → 을)', async () => {
    openSuccess(result({ topicTitle: '겨울 ' }));
    await screen.findByTestId('upload-success.root');
    expect(screen.getByTestId('upload-success.message').textContent).toContain('을 기록했어요.');
  });

  it('TC-UPL-088 화면을 열면 screen_view photo_upload_success가 1회 전송된다', async () => {
    const { h } = openSuccess();
    await screen.findByTestId('upload-success.root');
    expect(screenViews(h.tracker).filter((name) => name === 'photo_upload_success')).toHaveLength(1);
  });

  it('TC-UPL-086 "확인했어요."는 업로드한 topicDate의 전시(최신순)로 replace 이동하고 결과를 비운다', async () => {
    const app = openSuccess(result({ topicDate: '2026-10-27' }));
    await screen.findByTestId('upload-success.root');
    fireEvent.click(screen.getByTestId('upload-success.confirm-button'));
    await screen.findByTestId('display.root');
    expect(app.router.state.location.pathname).toBe('/display');
    expect(new URLSearchParams(app.router.state.location.search).get('date')).toBe('2026-10-27');
    expect(new URLSearchParams(app.router.state.location.search).get('sort')).toBe('recent');
    expect(app.router.state.historyAction).toBe('REPLACE');
    expect(app.h.container.uploadResults.get()).toBeNull();
  });

  it('TC-UPL-086 결과가 없으면(새로고침·딥링크) 홈으로 replace하고 screen_view도 보내지 않는다', async () => {
    const app = openSuccess(null);
    await screen.findByTestId('home.root');
    expect(app.router.state.location.pathname).toBe('/home');
    expect(app.router.state.historyAction).toBe('REPLACE');
    expect(screenViews(app.h.tracker)).not.toContain('photo_upload_success');
  });

  it('TC-UPL-086 게스트는 URL로도 들어올 수 없다(홈으로)', async () => {
    const app = openUploadApp({ mode: 'guest', path: '/upload/success' });
    await screen.findByTestId('home.root');
    expect(app.router.state.location.pathname).toBe('/home');
  });
});

describe('업로드 흐름 전체 (홈 → 업로드 → 성공 → 전시)', () => {
  it('TC-UPL-086 TC-UPL-088 TC-UPL-091 홈에서 +로 시작해 전시까지 가며 뒤로가기는 업로드·성공 화면이 아니라 홈이다', async () => {
    const app = openUploadApp({ path: '/home' });
    await screen.findByTestId('home.root');
    await waitFor(() => expect(screen.queryByTestId('home.hero-loading')).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    await screen.findByTestId('upload.root');
    // 업로드 성공 경로
    const input = screen.getByTestId('upload.album-button').querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [imageFile()] } });
    await screen.findByTestId('upload.photo-preview');
    // 서버가 이제부터 오늘 게시물을 PENDING으로 돌려준다
    app.routes.set('GET /posts/today', 'home/posts-today__posted-pending');
    fireEvent.click(screen.getByTestId('upload.submit-button'));
    await screen.findByTestId('upload-success.root');
    fireEvent.click(screen.getByTestId('upload-success.confirm-button'));
    await screen.findByTestId('display.root');
    expect(screenViews(app.h.tracker).filter((name) => ['home', 'photo_upload', 'photo_upload_success', 'display'].includes(name))).toEqual([
      'home',
      'photo_upload',
      'photo_upload_success',
      'display',
    ]);
    // 뒤로가기: 업로드 화면도 성공 화면도 아닌 홈
    await app.router.navigate(-1);
    await screen.findByTestId('home.root');
    expect(app.router.state.location.pathname).toBe('/home');
    expect(screen.queryByTestId('upload.root')).not.toBeInTheDocument();
    // 홈 히어로는 방금 올린 사진(검수 대기)을 보여 준다
    await waitFor(() => expect(screen.getByTestId('home.hero-pending-badge')).toBeInTheDocument());
    expect(screen.queryByTestId('home.hero-upload-button')).not.toBeInTheDocument();
  });
});
