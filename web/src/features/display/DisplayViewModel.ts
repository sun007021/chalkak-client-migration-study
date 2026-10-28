import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import type { SessionMode } from '../boot/authGate';
import type { PostLikeStore } from '../like/PostLikeStore';
import type { PostChanges } from '../post/PostChanges';
import type { PostItem } from '../post/postModels';
import type { PostDetailNavigator } from '../post/postNavigation';
import type { GuestGate } from '../shell/GuestGate';
import type { DisplaySort } from './displayDates';
import type { DisplayRepository } from './DisplayRepository';

/** 전시 본문. 날짜 이동 중 404·실패는 상태를 바꾸지 않는다(이전 ready 복원, 토스트). */
export type DisplayBody =
  /** 첫 로딩(보이는 사진이 없는 상태에서 날짜·정렬을 정해 읽는 중). 날짜 이동을 막는다(REQ-DISP-011). */
  | { status: 'loading' }
  /** 주제 404 또는 사진 0장(REQ-DISP-014). */
  | { status: 'empty' }
  /** 보이는 사진이 없을 때의 실패. network는 연결 실패·타임아웃. 다시 시도는 retry(). */
  | { status: 'error'; network: boolean }
  | {
      status: 'ready';
      topicTitle: string;
      /** 지금 보이는 전체 목록(서버 순서, 페이지 누적, id 중복 제거). */
      posts: PostItem[];
      /** 아카이브면 posts의 앞 5개(같은 좋아요 값), 아니면 빈 배열. */
      featured: PostItem[];
      hasNext: boolean;
      /** 기존 사진을 유지한 채 정렬·날짜 변경 또는 첫 페이지를 재검증 중(display.refresh-indicator). */
      refreshing: boolean;
      /** 다음 페이지 요청 중(display.load-more-indicator). */
      paging: boolean;
      /** 다음 페이지 요청이 실패한 횟수. 화면이 센티넬을 다시 세우는 열쇠로 쓴다(스크롤로 같은 페이지를 재요청, TC-DISP-026). */
      pageFailures: number;
    };

export interface DisplayState {
  mode: SessionMode;
  /** 날짜 상한: KST 오늘. */
  today: DateString;
  /** 선택한 날짜(이동 중이면 이동하려는 날짜). 이동 실패 시 마지막으로 보인 날짜로 되돌아간다. */
  date: DateString;
  /** 오늘 날짜에서 고른 정렬(기본 recent). 아카이브를 보는 동안에도 유지되어 오늘로 돌아오면 복원된다(REQ-DISP-017). */
  sort: DisplaySort;
  /** 실제로 요청하는 정렬: date가 오늘이면 sort, 아니면 popular. */
  requestSort: DisplaySort;
  /** date < today(정렬 탭 숨김, 추천 카드). */
  archive: boolean;
  body: DisplayBody;
  /** 하한(FIRST_TOPIC_DATE)이 아니고 첫 로딩 중이 아닐 때만. */
  canGoPrevious: boolean;
  /** 오늘이 아니고 첫 로딩 중이 아닐 때만. */
  canGoNext: boolean;
  /** 같은 날짜의 아카이브를 다시 불러와도 유지되고 다른 날짜로 가면 0으로 돌아간다(REQ-DISP-019). */
  featuredPage: number;
  /** 전시 탭 재선택마다 +1. 화면이 맨 위로 스크롤한다(REQ-DISP-029). */
  scrollToTop: number;
}

export interface DisplayViewModelDeps {
  mode: SessionMode;
  clock: Clock;
  repository: DisplayRepository;
  likes: PostLikeStore;
  changes: PostChanges;
  toast: ToastController;
  guestGate: GuestGate;
  navigator: PostDetailNavigator;
}

/**
 * 전시 탭 로직(화면은 그리기만). 컨테이너가 모드별로 하나를 보관하고(displaySession) 화면은 붙었다 떨어진다: 상세에 갔다 와도 목록·정렬·날짜가 남는다.
 *
 * 규칙 요약
 * - (날짜, 정렬) 키로 목록·다음 페이지 번호·시드·주제 제목을 캐시한다. 캐시가 있으면 즉시 보여 주고 첫 페이지를 조용히 재검증한다.
 *   재검증은 첫 페이지만 교체하고 같은 정렬·시드의 뒤쪽 페이지는 유지한다(시드가 바뀌면 뒤쪽을 버린다).
 * - 요청은 취소하지 않는다: 이전 (날짜, 정렬) 요청의 늦은 응답은 지금 상태를 덮지 않고 그 키의 캐시에만 남는다(stale 보호). 화면 이탈(onHidden)·계정 전환은 모두 무효화한다.
 * - 보이는 사진이 있으면 실패는 토스트(5xx·계약 위반 `display.error`, 연결 실패 `common.error.network`), 없으면 오류 화면(D-20).
 * - 응답의 좋아요 값은 likes.beginRead()/merge로 보정하고 changes의 like/removed 이벤트를 목록·추천·캐시에 반영한다. 삭제된 게시물은 changes.withoutRemoved로 거른다.
 * - 게스트는 인증 헤더 없는 공개 API만 쓰고 응답의 isLiked·isMine을 모두 false로 다룬다(D-05).
 */
export class DisplayViewModel extends ViewModel<DisplayState> {
  constructor(protected readonly deps: DisplayViewModelDeps) {
    super({
      mode: deps.mode,
      today: '1970-01-01',
      date: '1970-01-01',
      sort: 'recent',
      requestSort: 'recent',
      archive: false,
      body: { status: 'loading' },
      canGoPrevious: false,
      canGoNext: false,
      featuredPage: 0,
      scrollToTop: 0,
    });
  }

  /**
   * URL의 date·sort를 반영한다. 처음 부르면 전시를 연다(date 없음 = KST 오늘, sort 없음 = recent. 범위 밖 날짜는 가장 가까운 끝으로).
   * 이미 같은 날짜·정렬이면 아무 일도 하지 않는다(화면이 상태를 URL에 replace로 되써도 다시 불러오지 않는다, REQ-DISP-010).
   * 다르면 사용자가 고른 것과 같게 날짜/정렬을 바꾼다. 돌려준 약속은 그 로드(와 재검증)가 끝나면 이행된다.
   */
  applyRoute(_route: { date: DateString | null; sort: DisplaySort | null }): Promise<void> {
    throw new Error('not implemented');
  }

  /** 화면이 보인다(마운트·문서가 다시 보임). 처음이면 로드, 아니면 오늘 상한을 다시 계산하고(REQ-DISP-015) 현재 키의 첫 페이지를 조용히 재검증한다(REQ-DISP-030). */
  onShown(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 화면이 숨겨지거나 떨어진다: 진행 중 요청을 무효화한다. 취소는 오류 토스트·오류 화면이 되지 않는다(TC-DISP-048). */
  onHidden(): void {
    throw new Error('not implemented');
  }

  /** 이전 날짜(하루 전). 하한이거나 첫 로딩 중이면 아무 일도 없다. 이동 중이면 이동하려는 날짜 기준이다(TC-DISP-038). */
  selectPreviousDate(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 다음 날짜(하루 후). 오늘이거나 첫 로딩 중이면 아무 일도 없다. */
  selectNextDate(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 날짜 선택. normalizePickedDate와 같은 규칙으로 범위에 맞추고, 지금 선택된 날짜면 다시 불러오지 않는다. */
  selectDate(_date: DateString): Promise<void> {
    throw new Error('not implemented');
  }

  /** 정렬 탭(오늘 날짜에서만). 지난 날짜에서는 무시한다. 새 결과가 올 때까지 기존 사진을 유지한다. */
  selectSort(_sort: DisplaySort): Promise<void> {
    throw new Error('not implemented');
  }

  /** 오류 화면의 다시 시도: 같은 (날짜, 정렬)을 첫 로딩부터 다시. */
  retry(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 전시 탭 재선택: scrollToTop +1, 기존 전시를 유지한 채 첫 페이지 재검증(성공 → 교체, 실패 → 유지 + 토스트). */
  onTabReselect(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 목록 끝 근처 센티넬(displaySentinelIndex)이 보인다. 다음 페이지를 요청한다(진행 중·재검증 중·hasNext=false면 아무 일도 없다). 실패 뒤 다시 보이면 같은 페이지를 다시 요청한다. */
  onSentinelVisible(): Promise<void> {
    throw new Error('not implemented');
  }

  /** (스크롤 위치 신호용) 마지막으로 보이는 항목의 인덱스가 posts.length-3 이상이면 onSentinelVisible과 같다. */
  onLastVisibleIndexChanged(_index: number): Promise<void> {
    throw new Error('not implemented');
  }

  /** 사진 탭: 게스트는 `nav.guest.feed` 토스트(이동·요청 없음), 회원은 navigator.openPostDetail({ postId, seed: 지금 보이는 항목 }). */
  onPostPress(_postId: string): void {
    throw new Error('not implemented');
  }

  /** 하트 탭: 게스트는 `nav.guest.like` 토스트(요청·상태 변화 없음), 회원은 likes.toggle(지금 보이는 항목). */
  onLikePress(_postId: string): Promise<void> {
    throw new Error('not implemented');
  }

  /** 추천 카드 페이저의 현재 페이지. */
  setFeaturedPage(_page: number): void {
    throw new Error('not implemented');
  }

  /** 계정 전환·로그아웃: 캐시·시드·상태를 버리고 처음 상태로. 이전 계정의 늦은 응답은 무시한다. 보이고 있으면 곧바로 다시 불러온다. */
  resetForAccountChange(): void {
    throw new Error('not implemented');
  }

  override dispose(): void {
    super.dispose();
  }
}
