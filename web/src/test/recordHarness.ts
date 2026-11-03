import type { StoredSession } from '../core/auth/SessionStore';
import { ToastController } from '../core/ui/ToastController';
import type { SessionMode } from '../features/boot/authGate';
import { PostChanges } from '../features/post/PostChanges';
import { RecordRepository } from '../features/record/RecordRepository';
import { RecordViewModel } from '../features/record/RecordViewModel';
import type { RecordViewModelDeps } from '../features/record/RecordViewModel';
import { makeApiEnv } from './apiEnv';
import { FakeCalendarImageExporter } from './FakeCalendarImageExporter';
import { FakeFileDownloader } from './FakeFileDownloader';
import { FakeRecordNavigator } from './FakeRecordNavigator';
import type { RouteValue } from './fixtureRouter';
import { FixtureRouter } from './fixtureRouter';
import { guestSession, memberSession } from './fixtures';
import { RECORD_ROUTES, GUEST_RECORD_ROUTES } from './recordRoutes';
import { SequentialIdGenerator } from './sequentialIds';
import { recordToasts } from './toastLog';
import type { RecordState } from '../features/record/RecordViewModel';

export interface RecordHarnessOptions {
  mode?: SessionMode;
  /** ISO 시각. 기본 FIXTURE_NOW(KST 2026-10-27 12:00). */
  now?: string;
  session?: StoredSession;
  /** 기본 라우트 위에 덮어쓸 라우트. */
  routes?: Record<string, RouteValue>;
  /** true면 기본 라우트를 깔지 않는다(라우트에 없는 요청은 연결 실패로 거절되고 기록에 남는다). */
  bare?: boolean;
}

/** 기록 ViewModel 단위 테스트용: 실제 RecordRepository·ApiClient를 FakeFetch(FixtureRouter) 위에 엮고 이동·렌더·다운로드는 Fake로 둔다. */
export function createRecordHarness(options: RecordHarnessOptions = {}) {
  const mode = options.mode ?? 'member';
  const env = makeApiEnv(options.session ?? (mode === 'member' ? memberSession() : guestSession));
  if (options.now) env.clock.setWallClock(Date.parse(options.now));
  const defaults = options.bare ? {} : mode === 'member' ? RECORD_ROUTES : GUEST_RECORD_ROUTES;
  const router = new FixtureRouter(env.ff, { ...defaults, ...options.routes });
  const api = env.client();
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const changes = new PostChanges();
  const navigator = new FakeRecordNavigator();
  const exporter = new FakeCalendarImageExporter();
  const downloader = new FakeFileDownloader();
  const repository = new RecordRepository({ api });
  const deps: RecordViewModelDeps = { mode, clock: env.clock, repository, changes, toast, navigator, exporter, downloader };
  const viewModel = new RecordViewModel(deps);
  /** 같은 환경에 새 ViewModel을 하나 더 만든다(화면 전환·재진입이 아니라 앱 재시작 등). */
  const another = (overrides: Partial<RecordViewModelDeps> = {}) => new RecordViewModel({ ...deps, ...overrides });
  return { ...env, mode, router, toast, toasts, changes, navigator, exporter, downloader, repository, viewModel, another };
}

export type RecordHarness = ReturnType<typeof createRecordHarness>;

export type ReadyRecordBody = Extract<RecordState['body'], { status: 'ready' }>;

/** state.body가 ready일 때만 돌려준다. */
export function readyBody(vm: RecordViewModel): ReadyRecordBody {
  const { body } = vm.state;
  if (body.status !== 'ready') throw new Error(`body is ${body.status}`);
  return body;
}

/** ready 본문의 날짜 목록. */
export const datesOf = (vm: RecordViewModel): string[] => readyBody(vm).posts.map((p) => p.topicDate);

/** ready 본문의 게시물 id 끝 세 자리. */
export const postNumbers = (vm: RecordViewModel): string[] => readyBody(vm).posts.map((p) => p.postId.slice(-3));
