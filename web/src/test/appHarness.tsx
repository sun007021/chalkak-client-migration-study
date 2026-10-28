import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { InProcessRefreshLock } from '../core/auth/RefreshLock';
import type { StoredSession } from '../core/auth/SessionStore';
import { createAppContainer } from '../app/container';
import type { AppContainer, AppEnv } from '../app/container';
import { createAppRoutes } from '../app/routes';
import { FakeAnalyticsTracker } from './FakeAnalyticsTracker';
import { FakeClock } from './FakeClock';
import { FakeHomePreloader } from './FakeHomePreloader';
import { FakeSessionStore } from './FakeSessionStore';
import { FakeUploadEntry } from './FakeUploadEntry';
import { FakeBlobUrls } from './FakeBlobUrls';
import { FakeExternalLinkOpener } from './FakeExternalLinkOpener';
import { FakeSignatureRasterizer } from './FakeSignatureRasterizer';
import { FakeEditRenderer } from './FakeEditRenderer';
import { FakeImageDecoder } from './FakeImageDecoder';
import { FakeWebpCompressor } from './FakeWebpCompressor';
import type { PhotoEditorComponent } from '../features/upload/photoEditor';
import { FakeSocialLoginClient } from './FakeSocialLoginClient';
import { FakeFetch } from './fakeFetch';
import { MOCK_BASE } from './apiEnv';
import { NOW, guestSession } from './fixtures';
import { RecordingLogger } from './RecordingLogger';
import { SequentialIdGenerator } from './sequentialIds';
import type { VisibilityObserverFactory } from '../core/ui/VisibilityObserver';
import { EMPTY_SESSION } from '../core/auth/SessionStore';

export interface Harness {
  container: AppContainer;
  clock: FakeClock;
  ff: FakeFetch;
  store: FakeSessionStore;
  social: FakeSocialLoginClient;
  preloader: FakeHomePreloader;
  upload: FakeUploadEntry;
  tracker: FakeAnalyticsTracker;
  logger: RecordingLogger;
  /** 약관 문서 새 탭 열기 기록. */
  opener: FakeExternalLinkOpener;
  /** 사인 PNG 내보내기 Fake(크기·실패를 조절). */
  rasterizer: FakeSignatureRasterizer;
  blobUrls: FakeBlobUrls;
  /** 업로드 이미지 파이프라인 Fake(디코드·편집 적용·WebP 압축). */
  decoder: FakeImageDecoder;
  renderer: FakeEditRenderer;
  compressor: FakeWebpCompressor;
  /** 카메라 버튼 표시 여부. 테스트가 바꾸면 이후 렌더에 반영된다. */
  camera: { supported: boolean };
}

/** 실제 구현을 엮되 시계·fetch·저장소·카카오·프리로드·분석만 Fake로 둔 앱 컨테이너. */
export function makeHarness(
  options: {
    session?: StoredSession;
    env?: Partial<AppEnv>;
    devSession?: boolean;
    visibilityObserver?: VisibilityObserverFactory | null;
    resume?: (url: string) => Promise<{ idToken: string; rawNonce: string }>;
    /** true면 FakeUploadEntry 대신 컨테이너의 실제 UploadGate를 쓴다(진입 게이트 W 테스트). 기본 false. */
    realUpload?: boolean;
    /** 카메라 버튼 표시. 기본 false(데스크톱). */
    cameraSupported?: boolean;
    /** 편집기 화면(W7b). 기본 null = 편집기 없음. */
    photoEditor?: PhotoEditorComponent | null;
  } = {},
): Harness {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const store = new FakeSessionStore(options.session ?? EMPTY_SESSION);
  const social = new FakeSocialLoginClient();
  const preloader = new FakeHomePreloader().resolveImmediately();
  const upload = new FakeUploadEntry();
  const tracker = new FakeAnalyticsTracker();
  const logger = new RecordingLogger();
  const opener = new FakeExternalLinkOpener();
  const rasterizer = new FakeSignatureRasterizer();
  const blobUrls = new FakeBlobUrls();
  const decoder = new FakeImageDecoder();
  const renderer = new FakeEditRenderer();
  const compressor = new FakeWebpCompressor(clock);
  const camera = { supported: options.cameraSupported ?? false };
  const container = createAppContainer({
    env: { VITE_API_BASE_URL: MOCK_BASE, ...options.env },
    devSessionEnabled: options.devSession ?? false,
    visibilityObserver: options.visibilityObserver === undefined ? null : options.visibilityObserver, // jsdom에는 IntersectionObserver가 없다. 센티넬 테스트만 Fake를 넣는다.
    fetch: ff.fetch,
    clock,
    store,
    lock: new InProcessRefreshLock(),
    logger,
    tracker,
    ids: new SequentialIdGenerator(),
    socialLogin: social,
    resumeKakaoRedirect: options.resume,
    preloader,
    uploadEntry: options.realUpload ? undefined : upload,
    imageDecoder: decoder,
    webpCompressor: compressor,
    editRenderer: renderer,
    cameraCapture: { supported: () => camera.supported },
    photoEditor: options.photoEditor ?? null,
    externalLinkOpener: opener,
    signatureRasterizer: rasterizer,
    blobUrls,
  });
  return { container, clock, ff, store, social, preloader, upload, tracker, logger, opener, rasterizer, blobUrls, decoder, renderer, compressor, camera };
}

/** 라우터를 만들어 그린다. router.state로 현재 경로·이동 방식(PUSH/REPLACE)을 확인한다. */
export function renderApp(container: AppContainer, initialPath: string | { pathname: string; state?: unknown } = '/', options: { strict?: boolean } = {}) {
  const router = createMemoryRouter(createAppRoutes(container), { initialEntries: [initialPath] });
  const tree = <RouterProvider router={router} />;
  const view = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { router, ...view, path: () => router.state.location.pathname };
}

export { guestSession };
