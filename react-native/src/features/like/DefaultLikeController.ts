import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import type { UserDataCache } from '../../core/push/UserDataCache';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { LikeApi } from '../../data/like/LikeRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { LikeChange, LikeController, LikeSnapshot } from './LikeController';

export type DefaultLikeControllerDeps = {
  api: LikeApi;
  toast: ToastPresenter;
  /** 재인증 필요(401)면 롤백 뒤 로그인으로 보낸다(D-17). */
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

/**
 * D-04 구현. 화면들이 공유하는 좋아요 저장소이기도 하다(전시·홈·피드가 같은 인스턴스를 구독한다).
 * - toggle: 즉시 낙관 갱신(updated). 게시물마다 요청은 한 번에 하나, 진행 중 탭은 마지막 의도만 기억한다.
 * - 응답 뒤 최종 의도와 서버 상태가 다르면 한 번 더 보낸다. 성공 응답 값으로 덮어쓴다.
 * - 실패는 롤백(updated)과 토스트. 404는 removed, 403(PUT)은 정지 문구 + 재요청 없음.
 * - clearAll(계정 전환)이면 진행 중 응답을 무시하고 저장된 값을 비운다.
 */
/** 게시물 하나의 상태. 요청은 게시물마다 한 번에 하나만 나간다. */
type Entry = {
  /** 화면에 보이는 값(낙관 값 포함). */
  shown: LikeSnapshot;
  /** 마지막으로 확정된 값, 또는 진행 중 요청을 시작하기 직전 값. 실패하면 여기로 되돌린다. */
  base: LikeSnapshot;
  /** 사용자가 마지막으로 원한 isLiked. */
  intent: boolean;
  inFlight: boolean;
  /** shown이 마지막으로 바뀐 revision. */
  revision: number;
  abort: AbortController | null;
};

const flip = (current: LikeSnapshot, liked: boolean): LikeSnapshot => ({
  postId: current.postId,
  isLiked: liked,
  likeCount: Math.max(0, current.likeCount + (liked ? 1 : -1)),
});

const sameSnapshot = (a: LikeSnapshot, b: LikeSnapshot): boolean =>
  a.likeCount === b.likeCount && a.isLiked === b.isLiked;

export class DefaultLikeController implements LikeController, UserDataCache {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<(change: LikeChange) => void>();
  private counter = 0;

  constructor(private readonly deps: DefaultLikeControllerDeps) {}

  toggle(current: LikeSnapshot): void {
    const existing = this.entries.get(current.postId);
    // 진행 중이면 컨트롤러가 가진 값이 기준이다(화면이 한 박자 늦은 값을 넘겨도 안전하다).
    const from = existing?.inFlight ? existing.shown : current;
    const liked = !from.isLiked;
    const next = flip(from, liked);
    if (existing?.inFlight) {
      existing.intent = liked;
      this.setShown(existing, next);
      return;
    }
    const entry: Entry = {
      shown: from,
      base: { postId: from.postId, likeCount: from.likeCount, isLiked: from.isLiked },
      intent: liked,
      inFlight: false,
      revision: existing?.revision ?? 0,
      abort: null,
    };
    this.entries.set(from.postId, entry);
    this.setShown(entry, next);
    this.send(entry);
  }

  snapshot(postId: string): LikeSnapshot | undefined {
    return this.entries.get(postId)?.shown;
  }

  subscribe(listener: (change: LikeChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  revision(): number {
    return this.counter;
  }

  latestSince(postId: string, since: number): LikeSnapshot | undefined {
    const entry = this.entries.get(postId);
    return entry !== undefined && entry.revision > since ? entry.shown : undefined;
  }

  /** 계정 전환: 진행 중 요청은 조용히 버리고(롤백·토스트 없음) 저장된 값을 비운다. */
  clearAll(): void {
    for (const entry of this.entries.values()) entry.abort?.abort();
    this.entries.clear();
  }

  private setShown(entry: Entry, shown: LikeSnapshot): void {
    entry.shown = shown;
    this.counter += 1;
    entry.revision = this.counter;
    this.emit({ kind: 'updated', snapshot: shown });
  }

  private emit(change: LikeChange): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private send(entry: Entry): void {
    const postId = entry.shown.postId;
    const liked = entry.intent;
    const abort = new AbortController();
    entry.inFlight = true;
    entry.abort = abort;
    const request = liked
      ? this.deps.api.like(postId, abort.signal)
      : this.deps.api.unlike(postId, abort.signal);
    request.then(
      (result) => {
        if (this.entries.get(postId) !== entry) return; // clearAll 등으로 버려진 응답
        this.onSuccess(entry, { postId, likeCount: result.likeCount, isLiked: result.isLiked });
      },
      (error: unknown) => {
        if (this.entries.get(postId) !== entry) return;
        this.onFailure(entry, error, liked);
      },
    );
  }

  private onSuccess(entry: Entry, confirmed: LikeSnapshot): void {
    entry.inFlight = false;
    entry.abort = null;
    entry.base = confirmed;
    if (entry.intent !== confirmed.isLiked) {
      // 진행 중에 의도가 바뀌었다: 서버 값을 기준으로 낙관 값을 다시 맞추고 한 번 더 보낸다.
      const adjusted = flip(confirmed, entry.intent);
      if (!sameSnapshot(adjusted, entry.shown)) this.setShown(entry, adjusted);
      this.send(entry);
      return;
    }
    if (!sameSnapshot(confirmed, entry.shown)) this.setShown(entry, confirmed);
  }

  private onFailure(entry: Entry, error: unknown, wasLike: boolean): void {
    const postId = entry.shown.postId;
    entry.inFlight = false;
    entry.abort = null;
    if (error instanceof CancelledError) return;
    // 롤백 뒤에는 자동으로 다시 보내지 않는다(LIKE-022). 이후 탭은 새 요청이다.
    entry.intent = entry.base.isLiked;
    this.setShown(entry, entry.base);
    if (error instanceof HttpError && error.status === 404) {
      this.entries.delete(postId);
      this.emit({ kind: 'removed', postId });
      this.deps.toast.show(t('like.error.generic'));
    } else if (error instanceof HttpError && error.status === 403 && wasLike) {
      this.deps.toast.show(t('like.error.banned'));
    } else if (
      error instanceof ReauthenticationRequiredError ||
      error instanceof AuthenticationRequiredError
    ) {
      this.deps.authFlow.toLogin();
    } else {
      this.deps.toast.show(t('like.error.generic'));
    }
  }
}
