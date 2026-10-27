import type { SessionEvents } from './SessionEvents';
import type { SessionChannel } from './SessionChannel';
import type { SessionStore } from './SessionStore';
import type { UserCaches } from './UserCaches';

/** document의 가시성만. 테스트는 Fake를 넣는다. */
export interface VisibilityTarget {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** window의 pageshow만(뒤로/앞으로 캐시에서 복원될 때 persisted). */
export interface PageShowTarget {
  addEventListener(type: 'pageshow', listener: (event: { persisted?: boolean }) => void): void;
  removeEventListener(type: 'pageshow', listener: (event: { persisted?: boolean }) => void): void;
}

export interface CrossTabSessionSyncDeps {
  channel: SessionChannel;
  store: SessionStore;
  userCaches: UserCaches;
  sessionEvents: SessionEvents;
  document?: VisibilityTarget;
  window?: PageShowTarget;
}

/**
 * 다른 탭의 로그인·로그아웃·계정 전환을 이 탭에 전파한다(REQ-NAV-022의 Web 확장).
 * 이 탭이 알고 있는 userId(게스트·비로그인은 null)와 신호의 userId가 다르면 사용자 캐시를 비운 뒤 sessionEvents.emit('changed')한다.
 * 라우터가 부팅 경로(/)로 replace 이동해 인증 게이트를 다시 판정한다(회원 → 홈, 없음 → 로그인). 서버 호출은 하지 않는다.
 * 놓친 신호를 되찾으려고 문서가 다시 보일 때(visibilitychange, pageshow persisted) 저장소를 다시 읽어 같은 비교를 한다.
 * 이 탭 자신의 계정 변경은 noteLocalUser로 알려 준다(컨테이너가 이 탭의 store 신호를 가로채 부른다).
 */
export class CrossTabSessionSync {
  private known: string | null = null;
  private knownSettled = false;
  private queue: Promise<void> = Promise.resolve();
  private ready: Promise<void> = Promise.resolve();

  constructor(private readonly deps: CrossTabSessionSyncDeps) {}

  /** 이 탭이 직접 계정을 바꿨다(로그인·로그아웃·재인증 실패). */
  noteLocalUser(userId: string | null): void {
    this.known = userId;
    this.knownSettled = true;
  }

  /** 구독을 시작하고 중지 함수를 돌려준다. */
  start(): () => void {
    const { channel, store, document, window } = this.deps;
    let stopped = false;
    this.ready = store.read().then(
      (session) => {
        if (!this.knownSettled) this.noteLocalUser(session.userId);
      },
      () => undefined,
    );
    const offChannel = channel.subscribe((signal) => this.enqueue(() => this.apply(signal.userId), () => stopped));
    const recheck = () => {
      this.enqueue(async () => {
        const session = await store.read().catch(() => null);
        if (session) await this.apply(session.userId);
      }, () => stopped);
    };
    const onVisibility = () => {
      if (document?.visibilityState === 'visible') recheck();
    };
    const onPageShow = (event: { persisted?: boolean }) => {
      if (event.persisted) recheck();
    };
    document?.addEventListener('visibilitychange', onVisibility);
    window?.addEventListener('pageshow', onPageShow);
    return () => {
      stopped = true;
      offChannel();
      document?.removeEventListener('visibilitychange', onVisibility);
      window?.removeEventListener('pageshow', onPageShow);
    };
  }

  /** 신호·재확인을 한 줄로 세워 앞 처리가 끝난 뒤의 known과 비교한다. */
  private enqueue(job: () => Promise<void>, isStopped: () => boolean): void {
    this.queue = this.queue
      .then(() => this.ready)
      .then(() => (isStopped() ? undefined : job()))
      .catch(() => undefined);
  }

  private async apply(userId: string | null): Promise<void> {
    if (userId === this.known) return;
    this.known = userId;
    this.knownSettled = true;
    await this.deps.userCaches.clearAll(); // 실패해도 clearAll이 던지지 않는다
    this.deps.sessionEvents.emit('changed');
  }
}
