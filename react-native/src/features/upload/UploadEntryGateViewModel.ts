import { CancelledError, HttpError } from '../../core/http/ApiError';
import { t } from '../../shared/copy';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
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
  private readonly abort = new AbortController();
  private readonly auth: AuthErrorPolicy;
  private gone = false;

  constructor(private readonly deps: UploadEntryGateDeps) {
    super({ checking: false });
    this.auth = new AuthErrorPolicy(deps.authFlow);
  }

  async press(): Promise<void> {
    const { mode, posts, toast, navigator } = this.deps;
    if (this.gone || this.getSnapshot().checking) return;
    if (mode === 'guest') {
      toast.show(t('upload.gate.login-required'));
      return;
    }
    this.setState({ checking: true });
    try {
      const today = await posts.getToday(this.abort.signal);
      if (this.gone) return;
      if (today.isPosted) toast.show(t('upload.gate.already-posted'));
      else navigator.openUpload({ topicDate: today.topicDate });
    } catch (error) {
      if (this.gone || error instanceof CancelledError) return;
      if (this.auth.handle(error, 'upload-entry')) return;
      toast.show(this.messageFor(error));
    } finally {
      if (!this.gone) this.setState({ checking: false });
    }
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpError && error.status === 404) return t('upload.gate.no-open-topic');
    if (error instanceof HttpError && error.status === 403) return t('upload.gate.banned');
    return t('upload.gate.check-failed');
  }

  override dispose(): void {
    this.gone = true;
    this.abort.abort();
    super.dispose();
  }
}
