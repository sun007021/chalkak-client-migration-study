import { PresignedUploader } from '../core/net/PresignedUploader';
import { ToastController } from '../core/ui/ToastController';
import type { SessionMode } from '../features/boot/authGate';
import { HomeRepository } from '../features/home/HomeRepository';
import { PostChanges } from '../features/post/PostChanges';
import type { PostChange } from '../features/post/postModels';
import { GuestGate } from '../features/shell/GuestGate';
import { PhotoPreparer } from '../features/upload/PhotoPreparer';
import { UploadGate } from '../features/upload/UploadGate';
import { UploadRepository } from '../features/upload/UploadRepository';
import { UploadResultStore } from '../features/upload/UploadResult';
import { UploadViewModel } from '../features/upload/UploadViewModel';
import { makeApiEnv } from './apiEnv';
import { FakeEditRenderer } from './FakeEditRenderer';
import { flushAsync } from './FakeClock';
import { FakeImageDecoder, imageFile } from './FakeImageDecoder';
import type { FakeImageOptions } from './FakeImageDecoder';
import { FakeUploadNavigator } from './FakeUploadNavigator';
import { FakeWebpCompressor } from './FakeWebpCompressor';
import { FixtureRouter } from './fixtureRouter';
import type { RouteValue } from './fixtureRouter';
import { guestSession, memberSession } from './fixtures';
import { finish } from './homeHarness';
import { SequentialIdGenerator } from './sequentialIds';
import { recordToasts } from './toastLog';

/** 업로드 테스트의 기준값(shared/fixtures의 upload·home 폴더). 오늘 KST = 2026-10-27(화). */
export const TOPIC_DATE = '2026-10-27';
export const TOPIC_ID = '11111111-1111-4111-8111-111111111127';
export const TOPIC_TITLE = '가을 하늘';
export const UPLOAD_ID = '55555555-5555-4555-8555-555555555501';
export const UPLOAD_ID_NEW = '55555555-5555-4555-8555-555555555502';
export const UPLOAD_ID_SMALL = '55555555-5555-4555-8555-555555555503';
export const POST_ID = '22222222-2222-4222-8222-222222222201';

export const TOPICS = `GET /topics?date=${TOPIC_DATE}`;
export const POLICY = 'POST /posts/uploads';
export const CREATE = 'POST /posts';
export const TODAY = 'GET /posts/today';
export const REFRESH = 'POST /auth/refresh';
/** presigned URL은 `http://localhost:4010/__upload/<uploadId>?X-Amz-Expires=300`이다(fixture). 쿼리까지 같아야 FixtureRouter가 맞춘다. */
export const putKey = (uploadId: string): string => `PUT /__upload/${uploadId}?X-Amz-Expires=300`;

/** 업로드 성공 경로의 기본 라우트. 테스트가 필요한 키만 router.set으로 바꾼다. */
export const UPLOAD_ROUTES: Record<string, RouteValue> = {
  [TOPICS]: 'home/topics__open-2026-10-27',
  [POLICY]: 'upload/posts-uploads__issued',
  [putKey(UPLOAD_ID)]: 'upload/s3-put__200',
  [putKey(UPLOAD_ID_NEW)]: 'upload/s3-put__200',
  [putKey(UPLOAD_ID_SMALL)]: 'upload/s3-put__200',
  [CREATE]: 'upload/posts-create__201-pending',
  [TODAY]: 'upload/posts-today__not-posted',
};

/** 대기 중인 Promise 체인(fetch fake, Response.text, Blob.arrayBuffer 포함)을 충분히 비운다. 가짜 시계는 움직이지 않는다. */
export async function settleMore(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await flushAsync();
}

export interface UploadHarnessOptions {
  /** ISO 시각. 기본 FIXTURE_NOW(KST 2026-10-27 12:00). */
  now?: string;
  topicDate?: string;
  editorEnabled?: boolean;
  routes?: Record<string, RouteValue>;
}

/** UploadViewModel 단위 테스트용: 실제 Repository·PhotoPreparer·PresignedUploader를 FakeFetch(FixtureRouter) 위에 엮고 이미지 포트만 Fake로 둔다. */
export function createUploadHarness(options: UploadHarnessOptions = {}) {
  const env = makeApiEnv(memberSession());
  if (options.now) env.clock.setWallClock(Date.parse(options.now));
  const router = new FixtureRouter(env.ff, { ...UPLOAD_ROUTES, ...options.routes });
  const api = env.client();
  const decoder = new FakeImageDecoder();
  const compressor = new FakeWebpCompressor(env.clock);
  const renderer = new FakeEditRenderer();
  const repository = new UploadRepository({ api });
  const preparer = new PhotoPreparer({ repository, decoder, compressor, renderer, clock: env.clock });
  const uploader = new PresignedUploader({ fetch: env.ff.fetch, clock: env.clock });
  const results = new UploadResultStore();
  const changes = new PostChanges();
  const published: PostChange[] = [];
  changes.subscribe((change) => published.push(change));
  const vm = new UploadViewModel({
    topicDate: options.topicDate ?? TOPIC_DATE,
    repository,
    today: new HomeRepository({ api }),
    preparer,
    uploader,
    results,
    changes,
    editorEnabled: options.editorEnabled ?? false,
  });
  return { ...env, api, router, decoder, compressor, renderer, repository, preparer, uploader, results, changes, published, vm };
}

export type UploadHarness = ReturnType<typeof createUploadHarness>;

/** 주제를 받아 화면이 열린 상태까지. */
export async function openUpload(h: UploadHarness): Promise<void> {
  h.vm.start();
  await settleMore();
}

/** 사진을 고른다(편집기가 없으면 곧바로 확정되어 준비가 시작된다). 디코드 확인이 끝날 때까지 기다리고 백그라운드 준비는 기다리지 않는다. */
export async function pickPhoto(h: UploadHarness, options: FakeImageOptions = {}): Promise<File> {
  const file = imageFile(options);
  await finish(h, h.vm.selectPhoto(file));
  return file;
}

/** 주제 로드 → 사진 선택 → 사진 준비 완료까지. */
export async function prepareReady(h: UploadHarness, options: FakeImageOptions = {}): Promise<File> {
  await openUpload(h);
  const file = await pickPhoto(h, options);
  await settleMore();
  return file;
}

/** 'METHOD /path' 형태의 요청 순서(쿼리 제외). */
export const sequence = (h: Pick<UploadHarness, 'ff'>, from = 0): string[] => h.ff.calls.slice(from).map((c) => `${c.method} ${c.path}`);

/** 정책 발급·PUT·생성만(주제·today 조회 제외) 본 요청 순서. */
export const submitSequence = (h: Pick<UploadHarness, 'ff'>): string[] =>
  sequence(h).filter((entry) => entry === POLICY || entry.startsWith('PUT /__upload/') || entry === CREATE);

export const createBody = (h: Pick<UploadHarness, 'ff'>, index = 0): Record<string, unknown> =>
  JSON.parse(h.ff.callsTo(CREATE)[index]!.body as string) as Record<string, unknown>;

/** 업로드 진입 게이트 단위 테스트용. */
export function createGateHarness(options: { mode?: SessionMode; routes?: Record<string, RouteValue>; now?: string } = {}) {
  const mode = options.mode ?? 'member';
  const env = makeApiEnv(mode === 'member' ? memberSession() : guestSession);
  if (options.now) env.clock.setWallClock(Date.parse(options.now));
  const router = new FixtureRouter(env.ff, { [TODAY]: 'upload/posts-today__not-posted', ...options.routes });
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const navigator = new FakeUploadNavigator();
  const gate = new UploadGate({
    mode: async () => mode,
    guestGate: new GuestGate({ toast }),
    today: new HomeRepository({ api: env.client() }),
    navigator,
    toast,
  });
  return { ...env, mode, router, toast, toasts, navigator, gate };
}

export type GateHarness = ReturnType<typeof createGateHarness>;

/** 응답이 오지 않아 응답 타임아웃(15초)이 나는 서버. 가짜 시계가 16초 지나야 풀린다. */
export const hangingServer =
  (clock: { sleep(ms: number): Promise<void> }) =>
  async (): Promise<Response> => {
    await clock.sleep(16_000);
    return new Response(null, { status: 200 });
  };
