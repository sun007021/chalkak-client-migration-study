import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeGallerySaver } from '../../../core/media/__testing__/FakeGallerySaver';
import { FakeImagePicker } from '../../../core/media/__testing__/FakeImagePicker';
import { FakeLocalFiles } from '../../../core/media/__testing__/FakeLocalFiles';
import { FakeMediaPermissions } from '../../../core/media/__testing__/FakeMediaPermissions';
import { FakeMonotonicClock } from '../../../core/media/__testing__/FakeMonotonicClock';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { KstDate } from '../../../core/time/KstDate';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { PostCreationRepository } from '../../../data/post/PostCreationRepository';
import { PostRepository } from '../../../data/post/PostRepository';
import { TopicRepository } from '../../../data/topic/TopicRepository';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { FakeImageEngine } from '../../photo-edit/__testing__/FakeImageEngine';
import { PhotoEditViewModel } from '../../photo-edit/PhotoEditViewModel';
import { PhotoUploadViewModel } from '../PhotoUploadViewModel';
import { PostImageEncoder } from '../PostImageEncoder';
import { UploadPreparation } from '../UploadPreparation';
import { UploadSubmitter } from '../UploadSubmitter';
import { FakePostCreationNotifier } from './FakePostCreationNotifier';
import { FakeUploadNavigator } from './FakeUploadNavigator';

/** 기준 시각: KST 2026-10-27(화) 12:00. 진입 때 고정하는 topicDate는 2026-10-27. */
export const NOW = '2026-10-27T03:00:00Z';
export const TOPIC_DATE = KstDate.of(2026, 10, 27);
export const TOPIC_ID = '11111111-1111-4111-8111-111111111127';
export const TOPIC_TITLE = '가을 하늘';
export const UPLOAD_ID_1 = '55555555-5555-4555-8555-555555555501';
export const UPLOAD_ID_2 = '55555555-5555-4555-8555-555555555502';
export const UPLOAD_ID_3 = '55555555-5555-4555-8555-555555555503';
export const PHOTO_URI = 'file:///picked/photo-a.jpg';

/** 정책 발급·PUT·생성이 모두 성공하는 기본 라우트(회원, 오늘 미작성). */
export const UPLOAD_ROUTES: Record<string, RouteValue> = {
  'GET /posts/today': 'home/posts-today__not-posted',
  'GET /topics?date=2026-10-27': 'home/topics__open-2026-10-27',
  'POST /posts/uploads': 'upload/posts-uploads__issued',
  [`PUT /__upload/${UPLOAD_ID_1}`]: 'upload/s3-put__200',
  [`PUT /__upload/${UPLOAD_ID_2}`]: 'upload/s3-put__200',
  [`PUT /__upload/${UPLOAD_ID_3}`]: 'upload/s3-put__200',
  'POST /posts': 'upload/posts-create__201-pending',
};

export type UploadHarnessOptions = {
  now?: string;
  routes?: Record<string, RouteValue>;
  platform?: 'ios' | 'android';
};

/** 업로드 흐름 전체(정책 발급, 인코딩, PUT, 생성, 복구)를 실제 코드로 조립하고 네이티브 경계만 Fake로 둔다. */
export async function createUploadHarness(options: UploadHarnessOptions = {}) {
  const net = createNetHarness();
  net.clock.set(options.now ?? NOW);
  await net.signIn();
  const router = new FixtureRouter({ ...UPLOAD_ROUTES, ...options.routes }).install(net.transport);

  const files = new FakeLocalFiles();
  const engine = new FakeImageEngine(files);
  const picker = new FakeImagePicker();
  const gallery = new FakeGallerySaver();
  const permissions = new FakeMediaPermissions();
  const monotonic = new FakeMonotonicClock();
  const toast = new FakeToastPresenter();
  const analytics = new FakeAnalyticsTracker();
  const navigator = new FakeUploadNavigator();
  const notifier = new FakePostCreationNotifier();
  const authFlow = new FakeAuthFlowNavigator();

  const repository = new PostCreationRepository({ api: net.api });
  const posts = new PostRepository({ api: net.api });
  const topics = new TopicRepository({ api: net.api });
  const encoder = new PostImageEncoder({ engine, files });
  const preparation = new UploadPreparation({ repository, encoder, files, monotonic });
  const submitter = new UploadSubmitter({ repository, posts, preparation });

  const viewModel = new PhotoUploadViewModel({
    entry: { topicDate: TOPIC_DATE },
    clock: net.clock,
    platform: options.platform ?? 'android',
    topics,
    picker,
    gallery,
    permissions,
    engine,
    preparation,
    submitter,
    createEditor: (request) =>
      new PhotoEditViewModel({
        engine,
        files,
        sourceUri: request.sourceUri,
        sourceSize: request.sourceSize,
        initialEdit: request.initialEdit,
        onDone: request.onDone,
        onCancel: request.onCancel,
      }),
    toast,
    analytics,
    navigator,
    notifier,
    authFlow,
  });

  return {
    ...net,
    router,
    files,
    engine,
    picker,
    gallery,
    permissions,
    monotonic,
    toast,
    analytics,
    navigator,
    notifier,
    authFlow,
    repository,
    posts,
    topics,
    encoder,
    preparation,
    submitter,
    viewModel,
  };
}

export type UploadHarness = Awaited<ReturnType<typeof createUploadHarness>>;

/** 해당 라우트로 나간 요청 수. */
export const countOf = (h: Pick<UploadHarness, 'router'>, key: string): number =>
  h.router.calls(key).length;

/** 마이크로태스크를 충분히 비운다. */
export async function flush(times = 80): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}
