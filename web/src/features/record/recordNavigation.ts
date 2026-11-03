import type { DateString } from '../../core/time/kst';

const NOT_IMPLEMENTED = 'not implemented';

export type NavigateFn = (to: string, options?: { state?: unknown }) => void | Promise<void>;

/** 기록 탭이 다른 화면을 여는 통로(REQ-REC-034, 035). */
export interface RecordNavigator {
  /** "피드에서 보기": 내 게시물로 상세를 push한다. 썸네일을 함께 넘겨 로딩 중 미리 보여 준다. */
  openFeed(target: { postId: string; thumbnailImageUrl: string }): void;
  /** "전시 보러가기": 그 날짜의 전시를 push한다(뒤로 가면 기록). */
  openDisplay(date: DateString): void;
}

/** 오래 사는 ViewModel이 들고 있는 RecordNavigator. 화면이 붙어 있는 동안만 실제 구현을 꽂고, 붙어 있지 않을 때의 요청은 버린다. */
export class AttachableRecordNavigator implements RecordNavigator {
  attach(_target: RecordNavigator): () => void {
    throw new Error(NOT_IMPLEMENTED);
  }
  openFeed(_target: { postId: string; thumbnailImageUrl: string }): void {
    throw new Error(NOT_IMPLEMENTED);
  }
  openDisplay(_date: DateString): void {
    throw new Error(NOT_IMPLEMENTED);
  }
}

/** react-router navigate로 상세(`/feed/{postId}`, state recordFeedLocationState)와 전시(`/display?date=…`)를 push한다. */
export class RouterRecordNavigator implements RecordNavigator {
  constructor(protected readonly navigate: NavigateFn) {}

  openFeed(_target: { postId: string; thumbnailImageUrl: string }): void {
    throw new Error(NOT_IMPLEMENTED);
  }
  openDisplay(_date: DateString): void {
    throw new Error(NOT_IMPLEMENTED);
  }
}

/** `/display?date=2026-10-20`(정렬은 정하지 않는다: 전시가 날짜로 정한다). */
export function recordDisplayPath(_date: DateString): string {
  throw new Error(NOT_IMPLEMENTED);
}

/** 상세를 push할 때 넣는 location state: 내 게시물로 본다(assumeMine)와 로딩 중 미리 보일 썸네일. */
export function recordFeedLocationState(_thumbnailImageUrl: string): { assumeMine: true; thumbnailImageUrl: string } {
  throw new Error(NOT_IMPLEMENTED);
}

/** location.state에서 기록 진입 값을 꺼낸다. assumeMine이 true가 아니면 null. 썸네일은 https만 받고 아니면 null. */
export function readRecordFeedEntry(_state: unknown): { assumeMine: true; thumbnailImageUrl: string | null } | null {
  throw new Error(NOT_IMPLEMENTED);
}
