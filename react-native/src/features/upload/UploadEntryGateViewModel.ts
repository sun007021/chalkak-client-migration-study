import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { PostRepository } from '../../data/post/PostRepository';
import type { AuthFlowNavigator, MainMode } from '../auth/AuthFlowNavigator';
import type { UploadNavigator } from './UploadNavigator';

export type UploadEntryGateState = {
  /** GET /posts/today 확인 중(`upload-entry.loading`). */
  checking: boolean;
};

export type UploadEntryGateDeps = {
  mode: MainMode;
  posts: Pick<PostRepository, 'getToday'>;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
  navigator: Pick<UploadNavigator, 'openUpload'>;
  analytics?: AnalyticsTracker;
};

/**
 * 하단 가운데 업로드 버튼의 게이트(D-14-1). 게스트는 API 없이 토스트, 회원은 GET /posts/today를 한 번 부르고
 * 확인 중 연타는 무시한다. 통과하면 응답 topicDate로 업로드 화면을 연다. 화면을 벗어나면(dispose) 대기 중 요청을 취소한다.
 */
export class UploadEntryGateViewModel extends Observable<UploadEntryGateState> {
  constructor(private readonly deps: UploadEntryGateDeps) {
    super(initialGateState());
    void this.deps;
  }

  press(): Promise<void> {
    throw new Error('not implemented');
  }

  override dispose(): void {
    throw new Error('not implemented');
  }
}

function initialGateState(): UploadEntryGateState {
  throw new Error('not implemented');
}
