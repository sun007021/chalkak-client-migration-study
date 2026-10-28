import { json } from '../../../core/http/__testing__/FakeTransport';
import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../../core/http/__testing__/loadFixture';
import { FakeAppVisibility } from '../../../core/lifecycle/__testing__/FakeAppVisibility';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { RecordRepository } from '../../../data/record/RecordRepository';
import type { MainMode } from '../../auth/AuthFlowNavigator';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { FakePostChanges } from '../../post/__testing__/FakePostChanges';
import { RecordViewModel } from '../RecordViewModel';
import { FakeCalendarImageRenderer, FakeCalendarImageSaver } from './FakeCalendarImage';
import { FakeRecordNavigator } from './FakeRecordNavigator';

/** 기준 시각: KST 2026-10-27(화) 12:00. */
export const NOW = '2026-10-27T03:00:00Z';
export const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ID = (n: string) => `22222222-2222-4222-8222-222222222${n}`;
/** 2026-10 fixture의 사진들. */
export const P_1020 = ID('290');
export const P_1027 = ID('201');
export const P_1031 = ID('291');
export const P_0917 = ID('297');
export const P_0930 = ID('296');

export const MONTHS = 'GET /posts/calendar/months';
export const cal = (year: number, month: number) =>
  `GET /posts/calendar?year=${year}&month=${month}`;

/** 성공 경로 기본 라우트. 테스트가 필요한 키만 router.set으로 바꾼다. */
export const RECORD_ROUTES: Record<string, RouteValue> = {
  [MONTHS]: 'record/posts-calendar-months__recent-first',
  [cal(2026, 10)]: 'record/posts-calendar__2026-10',
  [cal(2026, 9)]: 'record/posts-calendar__2026-09',
  [cal(2026, 8)]: 'record/posts-calendar__2026-08-empty',
  [cal(2026, 11)]: 'record/posts-calendar__2026-11-empty',
};

/** 사진 없는 달 응답(fixture가 없는 달용). */
export const emptyMonth = (year: number, month: number): RouteValue =>
  (() => json(200, { year, month, posts: [] })) as RouteValue;

/** 사진 하나짜리 달 응답. */
export const oneMonth = (year: number, month: number, date: string, postId: string): RouteValue =>
  (() =>
    json(200, {
      year,
      month,
      posts: [
        {
          topicDate: date,
          postId,
          thumbnailImageUrl: `https://cdn.example.test/posts/${postId}/thumbnail.webp`,
          status: 'APPROVED',
        },
      ],
    })) as RouteValue;

export type RecordHarnessOptions = {
  mode?: MainMode;
  now?: string;
  routes?: Record<string, RouteValue>;
};

export async function createRecordHarness(options: RecordHarnessOptions = {}) {
  const mode = options.mode ?? 'member';
  const net = createNetHarness();
  net.clock.set(options.now ?? NOW);
  if (mode === 'member') await net.signIn({ userId: USER_A });
  else await net.sessionStore.enterGuest();
  const router = new FixtureRouter({ ...RECORD_ROUTES, ...options.routes }).install(net.transport);
  const changes = new FakePostChanges();
  const navigator = new FakeRecordNavigator();
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const visibility = new FakeAppVisibility();
  const imageRenderer = new FakeCalendarImageRenderer();
  const imageSaver = new FakeCalendarImageSaver();
  const viewModel = new RecordViewModel({
    mode,
    clock: net.clock,
    records: new RecordRepository({ api: net.api }),
    changes,
    navigator,
    toast,
    authFlow,
    visibility,
    imageRenderer,
    imageSaver,
  });
  /** 라우트 키 기준 호출 수. */
  const callsOf = (key: string) => router.calls(key).length;
  /** 상태가 바뀔 때마다의 스냅샷 기록. */
  const trace = () => {
    const states: ReturnType<typeof viewModel.getSnapshot>[] = [];
    const stop = viewModel.subscribe(() => states.push(viewModel.getSnapshot()));
    return { states, stop };
  };
  return {
    ...net,
    router,
    changes,
    navigator,
    toast,
    authFlow,
    visibility,
    imageRenderer,
    imageSaver,
    viewModel,
    callsOf,
    trace,
  };
}

export type RecordHarness = Awaited<ReturnType<typeof createRecordHarness>>;

/** 열 때까지 응답을 미루는 라우트. `release()`로 응답을 내보낸다. */
export function gatedRoute(router: FixtureRouter, key: string, fixture: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  router.set(key, async () => {
    await gate;
    return fixtureResponse(fixture);
  });
  return { release };
}

export const ymds = (photos: readonly { date: { toString(): string } }[]): string[] =>
  photos.map((p) => p.date.toString());
