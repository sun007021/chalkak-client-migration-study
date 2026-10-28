import { t } from '../../copy/ko';
import { ApiError, SessionChangedError } from '../../core/net/errors';
import type { ToastController } from '../../core/ui/ToastController';
import type { PostChanges } from '../post/PostChanges';
import type { LikeTarget, LikeValue } from '../post/postModels';
import type { LikeRepository, LikeResult } from './LikeRepository';

const key = (postId: string): string => postId.toLowerCase();


/** 읽기 요청(목록·상세)을 보내기 직전의 표시. merge에 그대로 돌려준다. */
export type ReadStamp = number;

export interface PostLikeStoreDeps {
  repository: LikeRepository;
  changes: PostChanges;
  toast: ToastController;
}

/**
 * 모든 화면(전시·홈 랭킹·상세)이 공유하는 좋아요 상태와 직렬화(D-04). 컨테이너가 하나를 들고 UserCaches로 reset한다.
 * - toggle은 누르는 즉시 isLiked를 뒤집고 likeCount를 ±1(0 아래로는 내리지 않음)해 PostChanges에 {type:'like'}로 알린다.
 * - 게시물마다 동시 요청은 최대 1개다. 진행 중에 누르면 마지막 의도만 기억하고, 응답 뒤 의도와 서버 상태가 다르면 한 번 더 보낸다.
 *   성공 응답의 likeCount·isLiked로 덮어쓴다(그 사이 의도가 바뀌었으면 의도 쪽 isLiked와 응답 likeCount±1).
 * - 실패(네트워크·5xx·계약 위반)는 서버 확정 값으로 되돌리고 `like.error.generic` 토스트. PUT 403은 `like.error.banned` 토스트이고 같은 요청을 다시 보내지 않는다.
 *   404는 되돌린 뒤 {type:'removed'}를 알리고 `like.error.generic` 토스트. 롤백 결과가 이미 마지막 의도와 같으면 추가 요청 없이 토스트만.
 * - 게스트 판정(D-05)은 호출자(ViewModel)가 GuestGate로 먼저 하고, 여기는 회원만 부른다.
 */
interface Entry {
  /** 화면이 보여 주는 값(낙관 포함). */
  shown: LikeValue;
  /** 서버가 마지막으로 확정한 값(첫 요청 전에는 누른 화면의 값). 실패하면 여기로 되돌린다. */
  server: LikeValue;
  /** 사용자의 마지막 의도(true = 좋아요). */
  intent: boolean;
  pending: boolean;
  /** shown이 마지막으로 바뀐 시점의 tick. */
  version: number;
  done: Promise<void>;
}

const flip = (value: LikeValue, liked: boolean): LikeValue =>
  value.isLiked === liked ? { ...value } : { isLiked: liked, likeCount: liked ? value.likeCount + 1 : Math.max(0, value.likeCount - 1) };

export class PostLikeStore {
  private entries = new Map<string, Entry>();
  /** 읽기 표시 기준 시계. 좋아요 값이 바뀔 때마다 오른다. */
  private tick = 0;
  /** reset마다 올린다. 이전 계정의 늦은 응답은 이 값이 달라 무시된다. */
  private epoch = 0;

  constructor(protected readonly deps: PostLikeStoreDeps) {}

  /** 읽기 요청을 보내기 직전에 부른다. */
  beginRead(): ReadStamp {
    return this.tick;
  }

  /**
   * 읽기 응답의 좋아요 값을 보정한다: 그 읽기를 시작한 뒤 좋아요가 바뀌었거나(낙관·확정·롤백 모두) 지금 요청이 진행 중인 게시물은 지금 값으로 바꾸고,
   * 나머지는 응답 값 그대로 돌려준다(REQ-LIKE-009).
   */
  merge<T extends LikeTarget>(items: readonly T[], stamp: ReadStamp): T[] {
    return items.map((item) => {
      const entry = this.entries.get(key(item.id));
      if (!entry || !(entry.pending || entry.version > stamp)) return item;
      return { ...item, isLiked: entry.shown.isLiked, likeCount: entry.shown.likeCount };
    });
  }

  /** 지금 화면에 보여야 하는 값(낙관 포함). 이 세션에서 좋아요 활동이 없었으면 undefined. */
  current(postId: string): LikeValue | undefined {
    const entry = this.entries.get(key(postId));
    return entry ? { ...entry.shown } : undefined;
  }

  /** 요청이 진행 중인가. */
  isPending(postId: string): boolean {
    return this.entries.get(key(postId))?.pending ?? false;
  }

  /**
   * 하트 누름. base는 화면이 지금 보여 주는 값(요청이 진행 중이 아니면 이 값에서 시작한다).
   * 돌려준 약속은 이 게시물의 직렬화된 요청이 모두 끝나면 이행된다(진행 중에 누른 호출은 바로 이행되어도 된다).
   */
  toggle(base: LikeTarget): Promise<void> {
    const id = key(base.id);
    const existing = this.entries.get(id);
    if (existing?.pending) {
      existing.intent = !existing.intent;
      this.show(base.id, existing, flip(existing.shown, existing.intent));
      return existing.done;
    }
    const start: LikeValue = { isLiked: base.isLiked, likeCount: base.likeCount };
    const entry: Entry = { shown: start, server: start, intent: !base.isLiked, pending: true, version: this.tick, done: Promise.resolve() };
    this.entries.set(id, entry);
    this.show(base.id, entry, flip(start, entry.intent));
    entry.done = this.run(base.id, entry, this.epoch);
    return entry.done;
  }

  /** 계정 전환·로그아웃: 상태를 모두 버리고 진행 중이던 응답은 무시한다(TC-LIKE-031). */
  reset(): void {
    this.epoch += 1;
    this.entries = new Map();
  }

  private show(postId: string, entry: Entry, value: LikeValue): void {
    entry.shown = value;
    entry.version = ++this.tick;
    this.deps.changes.publish({ type: 'like', postId, isLiked: value.isLiked, likeCount: value.likeCount });
  }

  /** 마지막 의도와 서버 상태가 같아질 때까지 요청을 하나씩 보낸다(동시 요청 1개). */
  private async run(postId: string, entry: Entry, epoch: number): Promise<void> {
    for (;;) {
      const liked = entry.intent;
      let result: LikeResult;
      try {
        result = liked ? await this.deps.repository.like(postId) : await this.deps.repository.unlike(postId);
      } catch (error) {
        if (epoch !== this.epoch) return;
        this.fail(postId, entry, error, liked);
        return;
      }
      if (epoch !== this.epoch) return;
      entry.server = { isLiked: result.isLiked, likeCount: result.likeCount };
      if (entry.intent === result.isLiked) {
        entry.pending = false;
        this.show(postId, entry, { ...entry.server });
        return;
      }
      // 응답을 기다리는 동안 의도가 바뀌었다: 의도 쪽 isLiked와 응답 likeCount±1을 보여 주고 반대 요청을 한 번 더 보낸다.
      this.show(postId, entry, flip(entry.server, entry.intent));
    }
  }

  /** 실패: 서버가 확정한 값으로 되돌리고 알린다. 되돌린 값이 곧 새 의도라 추가 요청은 없다. */
  private fail(postId: string, entry: Entry, error: unknown, wasLike: boolean): void {
    entry.pending = false;
    entry.intent = entry.server.isLiked;
    this.show(postId, entry, { ...entry.server });
    if (error instanceof SessionChangedError) return;
    if (error instanceof ApiError && error.status === 404) {
      this.deps.changes.publish({ type: 'removed', postId });
      this.deps.toast.show(t('like.error.generic'));
      return;
    }
    if (error instanceof ApiError && error.status === 403 && wasLike) {
      this.deps.toast.show(t('like.error.banned'));
      return;
    }
    this.deps.toast.show(t('like.error.generic'));
  }
}
