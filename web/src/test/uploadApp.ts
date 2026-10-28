import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { PhotoEditorComponent } from '../features/upload/photoEditor';
import { makeHarness, renderApp } from './appHarness';
import type { Harness } from './appHarness';
import { imageFile } from './FakeImageDecoder';
import type { FakeImageOptions } from './FakeImageDecoder';
import { FixtureRouter } from './fixtureRouter';
import type { RouteValue } from './fixtureRouter';
import { guestSession, memberSession } from './fixtures';
import { MEMBER_ROUTES } from './homeHarness';
import { POST_ROUTES } from './postRoutes';
import { TODAY, TOPIC_DATE, UPLOAD_ROUTES } from './uploadHarness';

export interface UploadAppOptions {
  mode?: 'member' | 'guest';
  /** 처음 열 경로(또는 state가 있는 위치). 기본 /home. */
  path?: string | { pathname: string; state?: unknown };
  routes?: Record<string, RouteValue>;
  cameraSupported?: boolean;
  photoEditor?: PhotoEditorComponent | null;
  /** false면 FakeUploadEntry(진입 게이트를 쓰지 않는 화면 테스트). 기본 true(실제 게이트). */
  realUpload?: boolean;
  strict?: boolean;
  /** 앱을 그리기 전에 컨테이너를 손본다(예: 업로드 결과 미리 담기). */
  beforeRender?: (h: Harness) => void;
}

/** 홈 + 전시 + 업로드 성공 경로 라우트를 모두 깔고(기본 오늘 미작성), 앱을 그린다. */
export function openUploadApp(options: UploadAppOptions = {}) {
  const mode = options.mode ?? 'member';
  const h = makeHarness({
    session: mode === 'member' ? memberSession() : guestSession,
    realUpload: options.realUpload ?? true,
    cameraSupported: options.cameraSupported,
    photoEditor: options.photoEditor,
  });
  const router = new FixtureRouter(h.ff, { ...POST_ROUTES, ...MEMBER_ROUTES, ...UPLOAD_ROUTES, ...options.routes });
  options.beforeRender?.(h);
  const view = renderApp(h.container, options.path ?? '/home', { strict: options.strict });
  return { h, routes: router, ...view };
}

export type UploadApp = ReturnType<typeof openUploadApp>;

/** 업로드 화면을 state와 함께 바로 연다(앱 안에서 push로 들어온 것과 같은 모양이 아니라 첫 항목이다). */
export const uploadLocation = (topicDate: string = TOPIC_DATE) => ({ pathname: '/upload', state: { topicDate } });

/** 업로드 화면이 열리고 주제가 준비될 때까지. */
export async function openUploadScreen(options: UploadAppOptions = {}) {
  const app = openUploadApp({ path: uploadLocation(), ...options });
  await screen.findByTestId('upload.root');
  await waitFor(() => expect(screen.getByTestId('upload.topic-title')).toBeInTheDocument());
  return app;
}

export const toastText = (): string | null => screen.queryByTestId('toast.message')?.textContent ?? null;

/** 앨범 입력(`upload.album-button` 라벨 안의 file input). */
export const albumInput = (): HTMLInputElement => screen.getByTestId('upload.album-button').querySelector('input[type="file"]') as HTMLInputElement;
export const cameraInput = (): HTMLInputElement => screen.getByTestId('upload.camera-button').querySelector('input[type="file"]') as HTMLInputElement;

/** 앨범에서 사진을 고른다(change 이벤트). 파일을 돌려준다. */
export async function chooseAlbumPhoto(options: FakeImageOptions = {}): Promise<File> {
  const file = imageFile(options);
  await act(async () => {
    fireEvent.change(albumInput(), { target: { files: [file] } });
  });
  return file;
}

/** 가짜 시계를 움직인다(재시도 백오프·타임아웃). */
export async function advance(h: Harness, ms: number): Promise<void> {
  await act(async () => {
    await h.clock.advance(ms);
  });
}

export { TODAY };
