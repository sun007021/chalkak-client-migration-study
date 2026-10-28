import type { DateString } from '../../core/time/kst';
import type { UploadNavigator } from './UploadNavigator';

export type NavigateFn = (to: string, options?: { state?: unknown; replace?: boolean }) => void | Promise<void>;

/** 업로드 화면 라우트의 location.state. 게이트가 진입 시점의 topicDate를 실어 보낸다. */
export interface UploadRouteState {
  topicDate: DateString;
}

/** react-router navigate로 업로드 화면을 연다: push로 `/upload`(ROUTES.upload)에 state `{ topicDate }`를 싣는다(뒤로 가면 버튼을 누른 화면으로 돌아온다). */
export class RouterUploadNavigator implements UploadNavigator {
  constructor(protected readonly navigate: NavigateFn) {}

  openUpload(_target: { topicDate: DateString }): void {
    throw new Error('not implemented');
  }
}

/** location.state에서 topicDate를 읽는다. 객체가 아니거나 topicDate가 yyyy-MM-dd 형식의 실제 날짜 문자열이 아니면 null(새 탭·딥링크로 들어온 경우, 화면은 홈으로 replace). */
export function readUploadRouteState(_state: unknown): UploadRouteState | null {
  throw new Error('not implemented');
}

export type UploadClosePlan = { kind: 'back' } | { kind: 'replace'; to: string };

/** 업로드 화면 닫기. 앱 안에서 push로 들어왔으면(location.key !== 'default') 뒤로 가기(버튼을 누른 화면으로), 새로고침·딥링크로 첫 항목이면 홈으로 replace. */
export function planUploadClose(_location: { key: string }): UploadClosePlan {
  throw new Error('not implemented');
}

/** 성공 화면의 "확인했어요." 이동 경로: 업로드한 topicDate의 전시(최신순) `/display?date=…&sort=recent` — 임시 결정: 방금 올린 사진이 보이는 최신순. */
export function successNextPath(_topicDate: DateString): string {
  throw new Error('not implemented');
}
