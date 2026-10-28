import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import type { PostLikeStore } from '../like/PostLikeStore';
import type { PostChanges } from '../post/PostChanges';
import type { PostSeed } from '../post/postModels';
import type { FeedRepository } from './FeedRepository';

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
  }

  /** 화면이 열릴 때 한 번. 끝나면 이행된다. */
  load(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 오류 화면의 다시 시도(첫 로딩부터). */
  retry(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 이미 내용이 보이는 상태에서 다시 확인(복귀). 실패하면 내용을 유지하고 토스트만. */
  refresh(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 하트 탭. canLike가 아니면 아무 일도 없다. */
  onLikePress(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 수정 버튼. canEditTitle이 아니면 아무 일도 없다. 현재 제목으로 입력을 채워 다이얼로그를 연다. */
  openTitleEdit(): void {
    throw new Error('not implemented');
  }

  setTitleInput(_raw: string): void {
    throw new Error('not implemented');
  }

  cancelTitleEdit(): void {
    throw new Error('not implemented');
  }

  /**
   * 저장. 저장 중이거나 canEditTitle이 아니면 요청을 보내지 않는다. 성공: 다이얼로그를 닫고 `feed.edit.success` 토스트,
   * 응답의 title을 상세에 반영하고 changes에 {type:'title'}을 알린다. 실패: 다이얼로그·입력을 유지하고 사유를 titleDialog.error에 둔다
   * (400 `feed.edit.error.state`, 403 `feed.edit.error.banned`(재요청 없음), 401 `feed.edit.error.login`, 연결 실패 `common.error.network`, 그 밖 `feed.edit.error.other`).
   * 404: 다이얼로그를 닫고 not-found 화면 + changes에 removed.
   */
  saveTitle(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 삭제 버튼. canDelete가 아니면 아무 일도 없다. */
  openDelete(): void {
    throw new Error('not implemented');
  }

  cancelDelete(): void {
    throw new Error('not implemented');
  }

  /**
   * 삭제 확정. 내 게시물이 아니거나 진행 중이면 요청을 보내지 않는다. 204: changes에 removed, `feed.delete.success` 토스트 1회, navigator.close().
   * 실패: 화면에 머물고 토스트로 알리며 다시 시도할 수 있다(400 `feed.delete.error.state`, 403 `feed.delete.error.forbidden`, 401 `feed.edit.error.login`,
   * 연결 실패 `common.error.network`, 그 밖 `feed.delete.error.other`). 404: not-found 화면 + changes에 removed + `feed.error.not-found` 토스트.
   */
  confirmDelete(): Promise<void> {
    throw new Error('not implemented');
  }

  override dispose(): void {
    super.dispose();
  }
}
