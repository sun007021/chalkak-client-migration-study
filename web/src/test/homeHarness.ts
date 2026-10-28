import type { StoredSession } from '../core/auth/SessionStore';
import type { RouteValue } from './fixtureRouter';
import { FixtureRouter } from './fixtureRouter';
import { makeApiEnv } from './apiEnv';
import { flushAsync } from './FakeClock';
import type { FakeClock } from './FakeClock';
import { FakeExternalLinkOpener } from './FakeExternalLinkOpener';
import { FakeHomeNavigator } from './FakeHomeNavigator';
import { FakeUploadEntry } from './FakeUploadEntry';
import { guestSession, memberSession } from './fixtures';
import { SequentialIdGenerator } from './sequentialIds';
import { recordToasts } from './toastLog';
import { ToastController } from '../core/ui/ToastController';
import { BannerFeed } from '../features/home/BannerFeed';
import { BannerRepository } from '../features/home/BannerRepository';
import { HomeRepository } from '../features/home/HomeRepository';
import { HomeViewModel } from '../features/home/HomeViewModel';
import { GuestGate } from '../features/shell/GuestGate';
import type { SessionMode } from '../features/boot/authGate';

/** 홈 테스트의 내 오늘 게시물(posts-today__posted-*.json의 postId). */
export const MY_POST_ID = '22222222-2222-4222-8222-222222222201';

export const TOPICS_TODAY = 'GET /topics?date=2026-10-27';
export const TOPICS_YESTERDAY = 'GET /topics?date=2026-10-26';
export const POPULAR_TODAY = 'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20';
export const POPULAR_YESTERDAY = 'GET /posts?topicDate=2026-10-26&sort=popular&page=1&pageSize=20';
export const TODAY_POST = 'GET /posts/today';
export const CALENDAR_OCT = 'GET /posts/calendar?year=2026&month=10';
export const BANNERS_P1 = 'GET /banners?page=1&pageSize=10';
export const BANNERS_P2 = 'GET /banners?page=2&pageSize=10';
export const UNREAD = 'GET /notifications/unread-status';

/** 회원의 성공 경로 기본 라우트(오늘 KST 2026-10-27 화). 테스트가 필요한 키만 router.set으로 바꾼다. */
export const MEMBER_ROUTES: Record<string, RouteValue> = {
  [TOPICS_TODAY]: 'home/topics__open-2026-10-27',
  [TOPICS_YESTERDAY]: 'home/topics__open-2026-10-26',
  [POPULAR_TODAY]: 'home/posts-list__popular-8',
  [POPULAR_YESTERDAY]: 'home/posts-list__popular-3',
  [TODAY_POST]: 'home/posts-today__posted-approved',
  [CALENDAR_OCT]: 'home/posts-calendar__2026-10-week-approved',
  [BANNERS_P1]: 'banner/banners__page1-10',
  [BANNERS_P2]: 'banner/banners__page2-last',
  [UNREAD]: 'home/notifications-unread-status__false',
  [`GET /posts/${MY_POST_ID}/ai-review`]: 'ai-review/ai-review-get__none',
};

/** 게스트는 개인 API 라우트가 없다: 불리면 연결 실패(TypeError)로 거절되고 호출 기록에 남아 "0건" 단언이 잡는다. */
export const GUEST_ROUTES: Record<string, RouteValue> = Object.fromEntries(
  Object.entries(MEMBER_ROUTES).filter(([key]) => !/\/posts\/today|\/posts\/calendar|unread-status|ai-review/.test(key)),
);

export interface HomeHarnessOptions {
  mode?: SessionMode;
  /** ISO 시각. 기본 FIXTURE_NOW(KST 2026-10-27 12:00). */
  now?: string;
  session?: StoredSession;
  /** BannerFeed를 바꿔 끼운다(예: 방어 분기 검증용 하위 클래스). */
  bannerFeed?: (repository: BannerRepository) => BannerFeed;
}

/** ViewModel 단위 테스트용: 실제 HomeRepository·BannerRepository·ApiClient를 FakeFetch(FixtureRouter) 위에 엮는다. */
export function createHomeHarness(options: HomeHarnessOptions = {}) {
  const mode = options.mode ?? 'member';
  const env = makeApiEnv(options.session ?? (mode === 'member' ? memberSession() : guestSession));
  if (options.now) env.clock.setWallClock(Date.parse(options.now));
  const router = new FixtureRouter(env.ff, mode === 'member' ? MEMBER_ROUTES : GUEST_ROUTES);
  const api = env.client();
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const navigator = new FakeHomeNavigator();
  const opener = new FakeExternalLinkOpener();
  const upload = new FakeUploadEntry();
  const bannerRepository = new BannerRepository({ api });
  const banners = options.bannerFeed ? options.bannerFeed(bannerRepository) : new BannerFeed({ repository: bannerRepository });
  const viewModel = new HomeViewModel({
    mode,
    clock: env.clock,
    repository: new HomeRepository({ api }),
    banners,
    toast,
    guestGate: new GuestGate({ toast }),
    uploadEntry: upload,
    navigator,
    externalLinkOpener: opener,
  });
  return { ...env, router, toast, toasts, navigator, opener, upload, banners, viewModel };
}

export type HomeHarness = ReturnType<typeof createHomeHarness>;

/** 시작된 요청 경로('/api/v1' 제외)를 모두. */
export const requestedPaths = (h: Pick<HomeHarness, 'ff'>, from = 0): string[] => h.ff.calls.slice(from).map((c) => c.path);

/** 대기 중인 Promise 체인을 비운다(가짜 타이머 없이 응답 반영 확인). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await flushAsync();
}

/**
 * 가짜 시계 위에서 약속이 끝날 때까지 기다린다: 마이크로태스크를 비우고, 아직 안 끝났으면 재시도 백오프(0.5초, 1초)가 지나도록 시계를 0.5초씩 전진한다.
 * 성공 경로(재시도 없음)에서는 시계를 움직이지 않으므로 KST 23:59:59 같은 시각 테스트에도 쓸 수 있다.
 */
export async function finish<T>(h: { clock: FakeClock }, promise: Promise<T>): Promise<T> {
  let done = false;
  const wrapped = promise.finally(() => {
    done = true;
  });
  wrapped.catch(() => undefined);
  for (let i = 0; ; i += 1) {
    await settle();
    if (done) break;
    if (i > 40) throw new Error('약속이 끝나지 않았다');
    await h.clock.advance(500);
  }
  return wrapped;
}
