import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import { todayKst } from '../../core/time/kst';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { PostDetail } from '../../data/post/PostModels';
import type { PostRepository } from '../../data/post/PostRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { LikeChange, LikeController } from '../like/LikeController';
import type { PostChanges } from '../post/PostChanges';
import type { FeedNavigator } from './FeedNavigator';
import type { FeedContent, FeedState } from './FeedState';
import type { FeedTarget } from './FeedTarget';
import { limitTitleInput, titleForRequest } from './titleInput';

export type FeedViewModelDeps = {
  target: FeedTarget;
  /** 저장된 로그인 userId. 상세 응답의 authorId와 비교해 내 게시물을 판정한다(D-26). */
  userId: string;
  clock: Clock;
  posts: PostRepository;
  likes: LikeController;
  changes: PostChanges;
  navigator: FeedNavigator;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

/**
 * 게시물 상세 상태. 한 게시물 하나를 열 때마다 소유자(내비게이션)가 만들고 닫을 때 dispose한다.
 * 좋아요는 LikeController에 위임하고 결과 알림으로 그린다. 상세 응답은 진행 중이거나 끝난 좋아요·제목 수정 결과를 덮지 않는다.
 */
export class FeedViewModel extends Observable<FeedState> {
  private generation = 0;
  private controller = new AbortController();
  private shown = false;
  /** 제목 수정이 성공할 때마다 올라간다. 요청 시작 뒤 수정이 있었다면 상세 응답의 제목은 쓰지 않는다. */
  private titleVersion = 0;
  private deleted = false;
  private stopLikes: (() => void) | null = null;

  private readonly authErrors: AuthErrorPolicy;

  constructor(private readonly deps: FeedViewModelDeps) {
    super(initialState(deps));
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  private get postId(): string {
    return this.deps.target.postId;
  }

  /** 화면이 보인다: 상세를 불러온다(시드가 있으면 시드를 먼저 보여 주고 재검증). 완료까지 resolve. */
  onShown(): Promise<void> {
    this.shown = true;
    this.stopLikes ??= this.deps.likes.subscribe((change) => this.onLikeChange(change));
    return this.load();
  }

  /** 화면 이탈: 진행 중 요청 취소(오류로 보이지 않음). */
  onHidden(): void {
    this.shown = false;
    this.stopLikes?.();
    this.stopLikes = null;
    this.invalidate();
  }

  /** 오류 화면의 "다시 시도". */
  retry(): Promise<void> {
    this.setState((s) => ({ ...s, status: 'loading', errorMessage: null }));
    return this.load();
  }

  onBackPress(): void {
    this.deps.navigator.close();
  }

  onLikePress(): void {
    const s = this.getSnapshot();
    if (!s.canLike || !s.content) return;
    this.deps.likes.toggle({
      postId: this.postId,
      likeCount: s.content.likeCount,
      isLiked: s.content.isLiked,
    });
  }

  /** 지금 시계 기준으로 수정 버튼을 보일지(내 게시물 + topicDate가 KST 오늘). 자정을 지나면 달라진다. */
  canEditTitle(): boolean {
    const s = this.getSnapshot();
    const topicDate = s.content?.topicDate;
    return (
      s.status === 'content' &&
      s.confirmed &&
      s.isMine &&
      !!topicDate &&
      topicDate.equals(todayKst(this.deps.clock))
    );
  }

  openTitleEditor(): void {
    const s = this.getSnapshot();
    if (!this.canEditTitle() || s.titleDialog) return;
    this.setState({
      ...s,
      titleDialog: { draft: s.content?.title ?? '', saving: false, errorMessage: null },
    });
  }

  closeTitleEditor(): void {
    this.setState((s) =>
      s.titleDialog && !s.titleDialog.saving ? { ...s, titleDialog: null } : s,
    );
  }

  onTitleInput(text: string): void {
    this.setState((s) => {
      if (!s.titleDialog || s.titleDialog.saving) return s;
      return {
        ...s,
        titleDialog: {
          ...s.titleDialog,
          draft: limitTitleInput(s.titleDialog.draft, text),
          errorMessage: null,
        },
      };
    });
  }

  async saveTitle(): Promise<void> {
    const dialog = this.getSnapshot().titleDialog;
    // 지난 주제의 내 게시물·남의 게시물은 요청 자체를 보내지 않는다(REQ-FEED-017).
    if (!dialog || dialog.saving || !this.canEditTitle()) return;
    this.setState((s) =>
      s.titleDialog ? { ...s, titleDialog: { ...s.titleDialog, saving: true } } : s,
    );
    try {
      const result = await this.deps.posts.updateTitle(this.postId, titleForRequest(dialog.draft));
      this.titleVersion += 1;
      this.setState((s) => ({
        ...s,
        content: s.content ? { ...s.content, title: result.title } : s.content,
        titleDialog: null,
      }));
      // 화면을 떠난 뒤 끝나도 서버에는 반영됐으므로 목록이 따라가게 알린다.
      this.deps.changes.publish({
        kind: 'title-changed',
        postId: this.postId,
        title: result.title,
      });
      this.deps.toast.show(t('feed.edit.success'));
    } catch (error) {
      this.onTitleFailure(error);
    }
  }

  requestDelete(): void {
    const s = this.getSnapshot();
    if (!s.canDelete || s.deleting || this.deleted) return;
    this.setState({ ...s, deleteDialogOpen: true });
  }

  cancelDelete(): void {
    this.setState((s) => (s.deleteDialogOpen ? { ...s, deleteDialogOpen: false } : s));
  }

  async confirmDelete(): Promise<void> {
    const s = this.getSnapshot();
    if (!s.deleteDialogOpen || s.deleting || !s.canDelete || this.deleted) return;
    this.setState({ ...s, deleteDialogOpen: false, deleting: true });
    try {
      await this.deps.posts.delete(this.postId);
      this.deleted = true;
      this.setState((cur) => ({ ...cur, deleting: false }));
      this.deps.changes.publish({ kind: 'deleted', postId: this.postId });
      this.deps.toast.show(t('feed.delete.success'));
      this.close();
    } catch (error) {
      this.setState((cur) => ({ ...cur, deleting: false }));
      this.onDeleteFailure(error);
    }
  }

  override dispose(): void {
    this.shown = false;
    this.invalidate();
    this.stopLikes?.();
    this.stopLikes = null;
    super.dispose();
  }

  // ---- 불러오기 ----

  private invalidate(): void {
    this.generation += 1;
    this.controller.abort();
    this.controller = new AbortController();
  }

  private async load(): Promise<void> {
    this.invalidate();
    const generation = this.generation;
    const since = this.deps.likes.revision();
    const titleVersion = this.titleVersion;
    try {
      const detail = await this.deps.posts.getDetail(this.postId, this.controller.signal);
      if (generation !== this.generation) return;
      this.applyDetail(detail, since, titleVersion);
    } catch (error) {
      if (generation !== this.generation || error instanceof CancelledError) return;
      this.onLoadFailure(error);
    }
  }

  private applyDetail(detail: PostDetail, since: number, titleVersion: number): void {
    // 요청을 보낸 뒤에 끝난 좋아요·제목 수정은 응답으로 덮지 않는다(REQ-FEED-008, REQ-LIKE-009).
    const latest = this.deps.likes.latestSince(detail.id, since);
    this.setState((s) =>
      this.compose({
        ...s,
        status: 'content',
        errorMessage: null,
        confirmed: true,
        isMine: detail.authorId === this.deps.userId,
        content: {
          postId: detail.id,
          authorId: detail.authorId,
          originalImageUrl: detail.originalImageUrl,
          thumbnailImageUrl: detail.thumbnailImageUrl,
          signatureOriginalImageUrl: detail.signatureOriginalImageUrl,
          title: this.titleVersion !== titleVersion ? (s.content?.title ?? null) : detail.title,
          topicDate: detail.topic.topicDate,
          likeCount: latest ? latest.likeCount : detail.likeCount,
          isLiked: latest ? latest.isLiked : detail.isLiked,
        },
      }),
    );
  }

  private onLoadFailure(error: unknown): void {
    if (error instanceof HttpError && error.status === 404) {
      this.setState((s) =>
        this.compose({
          ...s,
          status: 'not-found',
          errorMessage: null,
          content: null,
          confirmed: false,
        }),
      );
      // 목록에서 연 게시물이 사라졌다: 목록·캐시에서도 빼도록 알린다.
      if (this.deps.target.seed)
        this.deps.changes.publish({ kind: 'deleted', postId: this.postId });
      return;
    }
    if (this.sendToLogin(error)) return;
    const message =
      error instanceof NetworkError
        ? t('common.error.network')
        : error instanceof InvalidResponseError
          ? t('feed.error.invalid')
          : t('feed.error.load');
    if (this.getSnapshot().status === 'content') {
      this.deps.toast.show(message);
      return;
    }
    this.setState((s) => this.compose({ ...s, status: 'error', errorMessage: message }));
  }

  /** 인증 오류 정책(AuthErrorPolicy). 처리했으면 true: 오류 화면·토스트는 없다. */
  private sendToLogin(error: unknown): boolean {
    return this.authErrors.handle(error);
  }

  // ---- 수정·삭제 실패 ----

  private onTitleFailure(error: unknown): void {
    if (error instanceof HttpError && error.status === 404) {
      this.setState((s) => ({ ...s, titleDialog: null }));
      this.deps.toast.show(t('feed.error.not-found'));
      this.deps.changes.publish({ kind: 'deleted', postId: this.postId });
      this.close();
      return;
    }
    this.sendToLogin(error);
    const errorMessage = this.titleErrorMessage(error);
    this.setState((s) =>
      s.titleDialog ? { ...s, titleDialog: { ...s.titleDialog, saving: false, errorMessage } } : s,
    );
  }

  private titleErrorMessage(error: unknown): string {
    if (error instanceof HttpError) {
      // 400은 서버 문구와 상관없이 모두 상태 안내다(spec §5.2 표·D-02, Android와 동일).
      if (error.status === 400) return t('feed.edit.error.state');
      if (error.status === 403) return t('feed.edit.error.banned');
      if (error.status === 401) return t('feed.edit.error.login');
    }
    if (
      error instanceof AuthenticationRequiredError ||
      error instanceof ReauthenticationRequiredError
    ) {
      return t('feed.edit.error.login');
    }
    if (error instanceof NetworkError) return t('common.error.network');
    return t('feed.edit.error.other');
  }

  private onDeleteFailure(error: unknown): void {
    if (error instanceof HttpError && error.status === 404) {
      this.deps.toast.show(t('feed.error.not-found'));
      this.deps.changes.publish({ kind: 'deleted', postId: this.postId });
      this.close();
      return;
    }
    this.sendToLogin(error);
    this.deps.toast.show(this.deleteErrorMessage(error));
  }

  private deleteErrorMessage(error: unknown): string {
    if (error instanceof HttpError) {
      if (error.status === 400) return t('feed.delete.error.state');
      if (error.status === 403) return t('feed.delete.error.forbidden');
      if (error.status === 401) return t('feed.edit.error.login');
    }
    if (
      error instanceof AuthenticationRequiredError ||
      error instanceof ReauthenticationRequiredError
    ) {
      return t('feed.edit.error.login');
    }
    if (error instanceof NetworkError) return t('common.error.network');
    return t('feed.delete.error.other');
  }

  /** 화면을 떠난 뒤(이미 닫힌 뒤)에는 다시 닫지 않는다. 안 그러면 엉뚱한 화면이 닫힌다. */
  private close(): void {
    if (this.shown) this.deps.navigator.close();
  }

  // ---- 좋아요 ----

  private onLikeChange(change: LikeChange): void {
    if (change.kind === 'removed') {
      if (change.postId === this.postId) this.close();
      return;
    }
    const { snapshot } = change;
    if (snapshot.postId !== this.postId) return;
    this.setState((s) =>
      s.content
        ? {
            ...s,
            content: { ...s.content, likeCount: snapshot.likeCount, isLiked: snapshot.isLiked },
          }
        : s,
    );
  }

  // ---- 상태 조립 ----

  /** 상태에서 계산되는 버튼 노출(좋아요·수정·삭제)을 채운다. */
  private compose(state: FeedState): FeedState {
    const active = state.status === 'content' && state.confirmed && state.content !== null;
    const topicDate = state.content?.topicDate;
    return {
      ...state,
      canLike: active,
      canEditTitle:
        active && state.isMine && !!topicDate && topicDate.equals(todayKst(this.deps.clock)),
      canDelete: active && state.isMine,
    };
  }
}

function initialState(deps: FeedViewModelDeps): FeedState {
  const { target } = deps;
  const seed = target.seed;
  const content: FeedContent | null = seed
    ? {
        postId: seed.id,
        authorId: seed.authorId,
        originalImageUrl: seed.originalImageUrl,
        thumbnailImageUrl: seed.thumbnailImageUrl,
        signatureOriginalImageUrl: seed.signatureOriginalImageUrl,
        title: seed.title,
        topicDate: null,
        likeCount: seed.likeCount,
        isLiked: seed.isLiked,
      }
    : null;
  return {
    status: content ? 'content' : 'loading',
    errorMessage: null,
    content,
    confirmed: false,
    // 응답 전에는 진입 경로 값을 쓴다: 목록은 isMine, 기록·푸시(mine)는 내 게시물(REQ-FEED-005).
    isMine: seed ? seed.isMine : target.entry === 'mine',
    canLike: false,
    canEditTitle: false,
    canDelete: false,
    titleDialog: null,
    deleteDialogOpen: false,
    deleting: false,
  };
}
