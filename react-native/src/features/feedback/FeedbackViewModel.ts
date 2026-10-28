import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import { CancelledError, HttpError, NetworkError } from '../../core/http/ApiError';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { FeedbackRepository } from '../../data/feedback/FeedbackRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { FeedbackNavigator } from './FeedbackNavigator';
import { feedbackLength, trimFeedback, validateFeedback } from './feedbackText';

export type FeedbackState = {
  /** 입력 원문(앞뒤 공백 포함). */
  text: string;
  /** 앞뒤 공백을 뺀 code point 수(카운터). */
  count: number;
  canSubmit: boolean;
  sending: boolean;
  /** 길이 검증·400 문구(feedback.validation-message). */
  validationMessage: string | null;
  /** 전송 실패 문구(feedback.error-message). */
  errorMessage: string | null;
};

export type FeedbackViewModelDeps = {
  repository: FeedbackRepository;
  analytics: AnalyticsTracker;
  toast: ToastPresenter;
  navigator: FeedbackNavigator;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
  /** dispose 때 소유자가 캐시 등록을 해제하는 훅. */
  onDisposed?: () => void;
};

const INITIAL: FeedbackState = {
  text: '',
  count: 0,
  canSubmit: false,
  sending: false,
  validationMessage: null,
  errorMessage: null,
};

/**
 * 피드백 작성. 소유자(라우트)가 만들고 버리며 screen_view는 소유자가 start()로 한 번 보낸다.
 * 로그아웃·계정 전환(clearAll)과 dispose는 진행 중 요청을 취소하고, 늦은 응답은 토스트도 화면 전환도 일으키지 못한다.
 * 요청은 자동 재시도하지 않는다(ApiClient 정책).
 */
export class FeedbackViewModel extends Observable<FeedbackState> implements UserDataCache {
  private readonly authErrors: AuthErrorPolicy;
  private controller: AbortController | null = null;
  /** 보내기 한 번의 식별자. clearAll/dispose가 올려 늦은 응답을 무효로 만든다. */
  private token = 0;
  private started = false;

  constructor(private readonly deps: FeedbackViewModelDeps) {
    super(INITIAL);
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  /** 소유자가 만든 직후 한 번: screen_view feedback. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.deps.analytics.screenView('feedback');
  }

  onTextChange(text: string): void {
    const count = feedbackLength(text);
    this.setState({
      ...this.getSnapshot(),
      text,
      count,
      canSubmit: count >= 1 && !this.getSnapshot().sending,
    });
  }

  close(): void {
    this.deps.navigator.close();
  }

  async submit(): Promise<void> {
    const state = this.getSnapshot();
    if (state.sending || state.count < 1) return;
    if (validateFeedback(state.text) === 'too-long') {
      this.setState({
        ...state,
        validationMessage: t('fdbk.error.invalid'),
        errorMessage: null,
      });
      return;
    }
    const token = ++this.token;
    const controller = new AbortController();
    this.controller = controller;
    this.setState({
      ...state,
      sending: true,
      canSubmit: false,
      validationMessage: null,
      errorMessage: null,
    });
    try {
      await this.deps.repository.submit(trimFeedback(state.text), controller.signal);
    } catch (error) {
      if (token !== this.token) return;
      this.fail(error, token);
      return;
    }
    if (token !== this.token) return;
    this.controller = null;
    this.setState(INITIAL);
    this.deps.toast.show(t('fdbk.success'));
    this.deps.navigator.close();
  }

  /** 로그아웃·계정 전환: 요청을 버리고 입력을 비운다. */
  clearAll(): void {
    this.invalidate();
    this.setState(INITIAL);
  }

  override dispose(): void {
    this.invalidate();
    this.deps.onDisposed?.();
    super.dispose();
  }

  private invalidate(): void {
    this.token += 1;
    this.controller?.abort();
    this.controller = null;
  }

  private fail(error: unknown, token: number): void {
    this.controller = null;
    const state = this.getSnapshot();
    const keep = { ...state, sending: false, canSubmit: state.count >= 1 };
    if (error instanceof CancelledError) {
      this.setState(keep);
      return;
    }
    // 401: 로그인 이동은 정책이 정한다. 입력은 유지하고 문구는 없다.
    if (this.authErrors.handle(error, token)) {
      this.setState(keep);
      return;
    }
    if (error instanceof HttpError && error.status === 400) {
      this.setState({ ...keep, validationMessage: t('fdbk.error.invalid') });
    } else if (error instanceof NetworkError) {
      this.setState({ ...keep, errorMessage: t('common.error.network') });
    } else {
      this.setState({ ...keep, errorMessage: t('fdbk.error.generic') });
    }
  }
}
