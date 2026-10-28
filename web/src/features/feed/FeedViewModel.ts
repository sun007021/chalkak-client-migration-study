import { t } from '../../copy/ko';
import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import { MidnightWatcher } from '../../core/time/MidnightWatcher';
import { kstToday } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import type { PostLikeStore } from '../like/PostLikeStore';
import type { PostChanges } from '../post/PostChanges';
import type { PostChange, PostDetail, PostSeed } from '../post/postModels';
import type { FeedRepository } from './FeedRepository';
import { clampTitleInput, titlePayload } from './titleInput';

/** 상세 화면을 닫는 통로(화면이 꽂는다). 삭제 성공·좋아요 404 등 ViewModel이 닫아야 할 때 부른다. */
export interface FeedNavigator {
  close(): void;
}

/** 화면이 그리는 게시물. topicDate·topicTitle은 상세 응답 전(시드)에는 null. */
export interface FeedPost {
  id: string;
  authorId: string;
  originalImageUrl: string;
  thumbnailImageUrl: string | null;
  signatureOriginalImageUrl: string | null;
  /** null이면 화면이 "무제"를 보여 준다. */
  title: string | null;
  likeCount: number;
  isLiked: boolean;
  topicDate: DateString | null;
  topicTitle: string | null;
}

/** 로딩(시드 없음) / 내용 / 404 / 실패. 실패 사유: load(일반), invalid(응답 계약 위반), network(연결 실패). */
export type FeedView = { kind: 'loading' } | { kind: 'content' } | { kind: 'not-found' } | { kind: 'error'; reason: 'load' | 'invalid' | 'network' };

export interface TitleDialogState {
  open: boolean;
  /** clampTitleInput을 거친 입력값. 열 때 현재 제목(없으면 빈 문자열)으로 채운다. */
  input: string;
  saving: boolean;
  /** 저장 실패 사유 문구(copy). 없으면 null. 다이얼로그는 닫히지 않고 입력이 유지된다. */
  error: string | null;
}

export interface DeleteDialogState {
  open: boolean;
  deleting: boolean;
}

export interface FeedState {
  view: FeedView;
  /** view.kind가 content일 때만 값이 있다. 시드로 열면 로딩 없이 content다. */
  post: FeedPost | null;
  /** 상세 응답을 받았다(REQ-FEED-009: 확정 전에는 좋아요·수정·삭제를 막는다). */
  confirmed: boolean;
  /** 상세 재검증 중. */
  refreshing: boolean;
  /** 확정 전: 진입 경로 값(assumeMine ?? seed.isMine), 확정 후: authorId === 저장된 userId(D-26). */
  isMine: boolean;
  canLike: boolean;
  /** 확정 + 내 게시물 + topicDate가 KST 오늘(자정을 지나면 열려 있는 채로 false가 된다, TC-FEED-017). */
  canEditTitle: boolean;
  /** 확정 + 내 게시물. */
  canDelete: boolean;
  titleDialog: TitleDialogState;
  deleteDialog: DeleteDialogState;
}

export interface FeedViewModelDeps {
  postId: string;
  seed: PostSeed | null;
  /** 기록·푸시에서 연 경우 확정 전에도 내 게시물로 본다(REQ-FEED-002). */
  assumeMine?: boolean;
  /** 저장된 userId(게스트·미확인이면 null). */
  getUserId: () => Promise<string | null>;
  clock: Clock;
  repository: FeedRepository;
  likes: PostLikeStore;
  changes: PostChanges;
  toast: ToastController;
  navigator: FeedNavigator;
}

/**
 * 게시물 상세 로직(화면은 그리기만). 화면이 마운트될 때마다 새로 만들고 언마운트에서 dispose한다.
 *
 * - load(): 시드가 있으면 즉시 content(확정 전)로 두고 GET /posts/{id}로 재검증, 없으면 loading. 응답이 오면 확정(confirmed)·교체한다.
 *   응답은 진행 중이거나 이미 끝난 좋아요(likes.beginRead/merge)와 제목 수정 결과를 덮어쓰지 않는다. 404는 not-found(시드가 있었으면 changes에 removed를 알림),
 *   그 밖의 실패는 시드·내용이 있으면 유지하고 토스트만(연결 실패 `common.error.network`, 계약 위반 `feed.error.invalid`, 그 밖 `feed.error.load`), 없으면 error 화면.
 * - 좋아요: canLike일 때 likes.toggle. changes의 like 이벤트로 post 값을 바꾼다. 내 postId의 removed(좋아요 404 등 남이 알린 것)이면 navigator.close().
 * - 제목 수정·삭제: openTitleEdit/saveTitle, openDelete/confirmDelete. 문구·오류 분기는 REQ-FEED-018~030.
 * - dispose해도 진행 중인 삭제·제목 저장 요청의 결과는 changes에 반영한다(토스트는 ToastController가 보일 때만 띄운다).
 */
export class FeedViewModel extends ViewModel<FeedState> {
  private readonly unsubscribeChanges: () => void;
  private readonly midnight: MidnightWatcher;
  private closed = false;
  /** 상세 읽기(load·retry·refresh)마다 올린다. 최신이 아닌 응답은 버린다. */
  private loadSeq = 0;
  /** 제목 수정에 성공할 때마다 올린다. 그보다 먼저 시작한 읽기 응답이 수정한 제목을 덮지 않게 한다. */
  private titleEdits = 0;
  /** 이 ViewModel이 직접 알린 removed 이벤트는 자기 구독이 다시 받아 닫지 않는다. */
  private publishing = false;
  private deleted = false;

  constructor(protected readonly deps: FeedViewModelDeps) {
    super({
      view: { kind: 'loading' },
      post: null,
      confirmed: false,
      refreshing: false,
      isMine: false,
      canLike: false,
      canEditTitle: false,
      canDelete: false,
      titleDialog: { open: false, input: '', saving: false, error: null },
      deleteDialog: { open: false, deleting: false },
    });
    this.unsubscribeChanges = deps.changes.subscribe((change) => this.onChange(change));
    this.midnight = new MidnightWatcher({ clock: deps.clock, onDateChanged: () => this.update({}) });
  }

  /** 화면이 열릴 때 한 번. 끝나면 이행된다. */
  load(): Promise<void> {
    const { seed } = this.deps;
    if (seed) {
      const assumed = this.deps.assumeMine ?? seed.isMine;
      this.update({ view: { kind: 'content' }, post: FeedViewModel.fromSeed(seed), isMine: assumed });
    } else {
      this.update({ view: { kind: 'loading' }, post: null, isMine: this.deps.assumeMine ?? false });
    }
    this.midnight.start();
    return this.read();
  }

  /** 오류 화면의 다시 시도(첫 로딩부터). */
  retry(): Promise<void> {
    this.update({ view: { kind: 'loading' }, post: null, confirmed: false });
    return this.read();
  }

  /** 이미 내용이 보이는 상태에서 다시 확인(문서가 다시 보일 때 화면이 부른다). 실패하면 내용을 유지하고 토스트만. */
  refresh(): Promise<void> {
    return this.read();
  }

  /** 하트 탭. canLike가 아니면 아무 일도 없다. */
  async onLikePress(): Promise<void> {
    const { post, canLike } = this.state;
    if (!canLike || !post) return;
    await this.deps.likes.toggle({ id: post.id, isLiked: post.isLiked, likeCount: post.likeCount });
  }

  /** 수정 버튼. canEditTitle이 아니면 아무 일도 없다. 현재 제목으로 입력을 채워 다이얼로그를 연다. */
  openTitleEdit(): void {
    this.update({});
    const { canEditTitle, post } = this.state;
    if (!canEditTitle || !post) return;
    this.setState({ titleDialog: { open: true, input: clampTitleInput(post.title ?? ''), saving: false, error: null } });
  }

  setTitleInput(raw: string): void {
    const dialog = this.state.titleDialog;
    if (!dialog.open || dialog.saving) return;
    this.setState({ titleDialog: { ...dialog, input: clampTitleInput(raw), error: null } });
  }

  cancelTitleEdit(): void {
    const dialog = this.state.titleDialog;
    if (!dialog.open || dialog.saving) return;
    this.setState({ titleDialog: { open: false, input: '', saving: false, error: null } });
  }

  /**
   * 저장. 저장 중이거나 canEditTitle이 아니면 요청을 보내지 않는다. 성공: 다이얼로그를 닫고 `feed.edit.success` 토스트,
   * 응답의 title을 상세에 반영하고 changes에 {type:'title'}을 알린다. 실패: 다이얼로그·입력을 유지하고 사유를 titleDialog.error에 둔다
   * (400 `feed.edit.error.state`, 403 `feed.edit.error.banned`(재요청 없음), 401 `feed.edit.error.login`, 연결 실패 `common.error.network`, 그 밖 `feed.edit.error.other`).
   * 404: 다이얼로그를 닫고 not-found 화면 + changes에 removed.
   */
  async saveTitle(): Promise<void> {
    this.update({});
    const dialog = this.state.titleDialog;
    const { post, canEditTitle } = this.state;
    if (!dialog.open || dialog.saving || !post) return;
    if (!canEditTitle) {
      // 다이얼로그가 열린 채 KST 자정을 지났다: 요청은 보내지 않고(REQ-FEED-017) 사유를 보여 준다(REQ-FEED-023, 입력은 유지).
      if (this.state.isMine) this.setState({ titleDialog: { ...dialog, error: t('feed.edit.error.state') } });
      return;
    }
    this.setState({ titleDialog: { ...dialog, saving: true, error: null } });
    try {
      const result = await this.deps.repository.updateTitle(post.id, titlePayload(dialog.input));
      this.titleEdits += 1;
      if (!this.closed) {
        const current = this.state.post;
        this.setState({ titleDialog: { open: false, input: '', saving: false, error: null }, post: current ? { ...current, title: result.title } : current });
      }
      this.deps.changes.publish({ type: 'title', postId: post.id, title: result.title });
      this.deps.toast.show(t('feed.edit.success'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        if (!this.closed) this.update({ view: { kind: 'not-found' }, post: null, titleDialog: { open: false, input: '', saving: false, error: null } });
        this.announceRemoved(post.id);
        return;
      }
      if (this.closed) return;
      this.setState({ titleDialog: { ...this.state.titleDialog, saving: false, error: FeedViewModel.titleError(error) } });
    }
  }

  /** 삭제 버튼. canDelete가 아니면 아무 일도 없다. */
  openDelete(): void {
    this.update({});
    if (!this.state.canDelete || this.deleted) return;
    this.setState({ deleteDialog: { open: true, deleting: false } });
  }

  cancelDelete(): void {
    if (this.state.deleteDialog.deleting) return;
    this.setState({ deleteDialog: { open: false, deleting: false } });
  }

  /**
   * 삭제 확정. 내 게시물이 아니거나 진행 중이면 요청을 보내지 않는다. 204: changes에 removed, `feed.delete.success` 토스트 1회, navigator.close().
   * 실패: 화면에 머물고 토스트로 알리며 다시 시도할 수 있다(400 `feed.delete.error.state`, 403 `feed.delete.error.forbidden`, 401 `feed.edit.error.login`,
   * 연결 실패 `common.error.network`, 그 밖 `feed.delete.error.other`). 404: not-found 화면 + changes에 removed + `feed.error.not-found` 토스트.
   */
  async confirmDelete(): Promise<void> {
    const { post, canDelete, deleteDialog } = this.state;
    if (!deleteDialog.open || deleteDialog.deleting || !canDelete || !post || this.deleted) return;
    this.setState({ deleteDialog: { open: true, deleting: true } });
    try {
      await this.deps.repository.deletePost(post.id);
    } catch (error) {
      if (!this.closed) this.setState({ deleteDialog: { open: false, deleting: false } });
      if (error instanceof ApiError && error.status === 404) {
        if (!this.closed) this.update({ view: { kind: 'not-found' }, post: null });
        this.announceRemoved(post.id);
        this.deps.toast.show(t('feed.error.not-found'));
        return;
      }
      this.deps.toast.show(FeedViewModel.deleteError(error));
      return;
    }
    this.deleted = true;
    if (!this.closed) this.setState({ deleteDialog: { open: false, deleting: false } });
    this.announceRemoved(post.id);
    this.deps.toast.show(t('feed.delete.success'));
    if (!this.closed) this.deps.navigator.close();
  }

  override dispose(): void {
    this.closed = true;
    this.loadSeq += 1;
    this.unsubscribeChanges();
    this.midnight.stop();
    super.dispose();
  }

  // ---------------------------------------------------------------- 읽기

  private async read(): Promise<void> {
    const token = ++this.loadSeq;
    const stamp = this.deps.likes.beginRead();
    const titleMark = this.titleEdits;
    if (this.state.view.kind === 'content') this.setState({ refreshing: true });
    let detail: PostDetail;
    try {
      detail = await this.deps.repository.fetchPost(this.deps.postId);
    } catch (error) {
      if (this.closed || token !== this.loadSeq) return;
      this.onReadFailure(error);
      return;
    }
    // 저장된 userId를 읽지 못하면(저장소 오류) 판정을 바꾸지 않고 지금의 isMine을 유지한다. 게스트·미확인(null)과는 다르다.
    const userId = await this.deps.getUserId().catch(() => undefined);
    if (this.closed || token !== this.loadSeq) return;
    const [merged] = this.deps.likes.merge([{ id: detail.id, isLiked: detail.isLiked, likeCount: detail.likeCount }], stamp);
    const current = this.state.post;
    this.update({
      view: { kind: 'content' },
      confirmed: true,
      refreshing: false,
      isMine: this.deps.assumeMine === true || (userId === undefined ? this.state.isMine : userId !== null && detail.authorId === userId),
      post: {
        id: detail.id,
        authorId: detail.authorId,
        originalImageUrl: detail.originalImageUrl,
        thumbnailImageUrl: detail.thumbnailImageUrl,
        signatureOriginalImageUrl: detail.signatureOriginalImageUrl,
        title: titleMark !== this.titleEdits && current ? current.title : detail.title,
        likeCount: merged?.likeCount ?? detail.likeCount,
        isLiked: merged?.isLiked ?? detail.isLiked,
        topicDate: detail.topic.topicDate,
        topicTitle: detail.topic.title,
      },
    });
  }

  private onReadFailure(error: unknown): void {
    if (error instanceof ApiError && error.status === 404) {
      this.update({ view: { kind: 'not-found' }, post: null, refreshing: false });
      if (this.deps.seed) this.announceRemoved(this.deps.postId);
      return;
    }
    const reason = error instanceof NetworkError ? 'network' : error instanceof InvalidResponseError ? 'invalid' : 'load';
    if (this.state.view.kind === 'content') {
      this.setState({ refreshing: false });
      this.deps.toast.show(reason === 'network' ? t('common.error.network') : reason === 'invalid' ? t('feed.error.invalid') : t('feed.error.load'));
      return;
    }
    this.update({ view: { kind: 'error', reason }, refreshing: false });
  }

  // ---------------------------------------------------------------- 이벤트·상태

  private onChange(change: PostChange): void {
    if (change.postId.toLowerCase() !== this.deps.postId.toLowerCase()) return;
    const post = this.state.post;
    if (change.type === 'removed') {
      if (!this.publishing) this.deps.navigator.close();
      return;
    }
    if (!post) return;
    if (change.type === 'like') this.setState({ post: { ...post, isLiked: change.isLiked, likeCount: change.likeCount } });
    else this.setState({ post: { ...post, title: change.title } });
  }

  private announceRemoved(postId: string): void {
    this.publishing = true;
    try {
      this.deps.changes.publish({ type: 'removed', postId });
    } finally {
      this.publishing = false;
    }
  }

  /** 상태를 바꾸고 파생 값(canLike, canEditTitle, canDelete)을 다시 계산한다. */
  private update(patch: Partial<FeedState>): void {
    const view = patch.view ?? this.state.view;
    const post = patch.post === undefined ? this.state.post : patch.post;
    const confirmed = view.kind === 'content' && (patch.confirmed ?? this.state.confirmed);
    const isMine = patch.isMine ?? this.state.isMine;
    const content = view.kind === 'content';
    this.setState({
      ...patch,
      confirmed,
      canLike: content && confirmed,
      canEditTitle: content && confirmed && isMine && post?.topicDate != null && post.topicDate === kstToday(this.deps.clock),
      canDelete: content && confirmed && isMine,
    });
  }

  private static fromSeed(seed: PostSeed): FeedPost {
    return {
      id: seed.id,
      authorId: seed.authorId,
      originalImageUrl: seed.originalImageUrl,
      thumbnailImageUrl: seed.thumbnailImageUrl,
      signatureOriginalImageUrl: seed.signatureOriginalImageUrl ?? null,
      title: seed.title,
      likeCount: seed.likeCount,
      isLiked: seed.isLiked,
      topicDate: null,
      topicTitle: null,
    };
  }

  private static titleError(error: unknown): string {
    if (error instanceof NetworkError) return t('common.error.network');
    if (error instanceof ApiError) {
      if (error.status === 400) return t('feed.edit.error.state');
      if (error.status === 403) return t('feed.edit.error.banned');
      if (error.status === 401) return t('feed.edit.error.login');
    }
    return t('feed.edit.error.other');
  }

  private static deleteError(error: unknown): string {
    if (error instanceof NetworkError) return t('common.error.network');
    if (error instanceof ApiError) {
      if (error.status === 400) return t('feed.delete.error.state');
      if (error.status === 403) return t('feed.delete.error.forbidden');
      if (error.status === 401) return t('feed.edit.error.login');
    }
    return t('feed.delete.error.other');
  }
}
