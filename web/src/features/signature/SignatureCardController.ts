import { t } from '../../copy/ko';
import { ApiError } from '../../core/net/errors';
import { StaleGuard } from '../../core/state/StaleGuard';
import type { Ticket } from '../../core/state/StaleGuard';
import { ViewModel } from '../../core/state/ViewModel';
import type { UserCache } from '../../core/auth/UserCaches';
import type { ToastController } from '../../core/ui/ToastController';
import type { SignatureRepository } from './SignatureRepository';

export interface SignatureCardState {
  /** idle: 아직 조회 전·비움. loading: 조회 중(이전 사인이 있으면 imageUrl 유지). content: 조회 성공. registration_required: 400 SIGNATURE_REGISTRATION_REQUIRED. error: 조회 실패인데 보여 줄 사인이 없다. */
  status: 'idle' | 'loading' | 'content' | 'registration_required' | 'error';
  /** 사인 카드가 그릴 URL(썸네일 우선, null이면 원본). 없으면 null. */
  imageUrl: string | null;
}

/**
 * 설정 사인 카드의 데이터(설정 화면은 다음 PR). 컨테이너가 하나 들고 UserCaches에 등록한다(로그아웃·계정 전환 시 clear).
 * refresh: 진행 중이면 같은 약속을 돌려줘 중복 요청이 없다(REQ-SIGN-014). 성공 → content(+imageUrl, 응답을 쓰고 PUT 응답 URL은 쓰지 않는다).
 * 400 SIGNATURE_REGISTRATION_REQUIRED → registration_required, imageUrl null, 토스트 없음. 그 밖의 실패 → 이미 보이던 사인이 있으면 그대로 두고 토스트 sign.load.error, 없으면 error 상태(토스트 없음, D-20).
 * 401(갱신 후에도 실패)은 어느 쪽이든 토스트 없음. refresh는 던지지 않는다. 계정이 바뀌어 clear된 뒤 늦게 온 응답은 반영하지 않는다(TC-SIGN-038).
 */
export class SignatureCardController extends ViewModel<SignatureCardState> implements UserCache {
  private readonly guard = new StaleGuard();
  private inflight: Promise<void> | null = null;

  constructor(private readonly deps: { repository: SignatureRepository; toast: ToastController }) {
    super({ status: 'idle', imageUrl: null });
  }

  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    const ticket = this.guard.begin();
    this.setState({ status: 'loading' });
    const run = this.load(ticket).finally(() => {
      if (this.inflight === run) this.inflight = null;
    });
    this.inflight = run;
    return run;
  }

  /** idle로 되돌리고 진행 중 응답을 무효화한다. */
  clear(): void {
    this.guard.invalidate();
    this.inflight = null;
    this.setState({ status: 'idle', imageUrl: null });
  }

  private async load(ticket: Ticket): Promise<void> {
    try {
      const current = await this.deps.repository.fetchCurrent();
      if (!ticket.isCurrent()) return;
      this.setState({ status: 'content', imageUrl: current.displayUrl });
    } catch (error) {
      if (!ticket.isCurrent()) return;
      if (error instanceof ApiError && error.status === 400 && error.errorCode === 'SIGNATURE_REGISTRATION_REQUIRED') {
        this.setState({ status: 'registration_required', imageUrl: null });
        return;
      }
      const silent = error instanceof ApiError && error.status === 401;
      if (this.state.imageUrl !== null) {
        this.setState({ status: 'content' });
        if (!silent) this.deps.toast.show(t('sign.load.error'));
      } else {
        this.setState({ status: 'error' });
      }
    }
  }
}
