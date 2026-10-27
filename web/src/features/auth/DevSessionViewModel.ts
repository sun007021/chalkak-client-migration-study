import { ViewModel } from '../../core/state/ViewModel';
import type { DevSessionService } from './DevSessionService';

export interface DevSessionState {
  refreshToken: string;
  userId: string;
  busy: boolean;
  /** 실패 안내(role="alert"). */
  error: string | null;
}

/** 개발용 세션 주입 화면의 상태. 개발 빌드에서만 동적으로 불러온다(Q-02). */
export class DevSessionViewModel extends ViewModel<DevSessionState> {
  constructor(private readonly service: DevSessionService) {
    super({ refreshToken: '', userId: '', busy: false, error: null });
  }

  setRefreshToken(refreshToken: string): void {
    this.setState({ refreshToken });
  }

  setUserId(userId: string): void {
    this.setState({ userId });
  }

  /** 성공하면 true. 진행 중이면 아무것도 하지 않고 false. */
  async submit(): Promise<boolean> {
    if (this.state.busy) return false;
    this.setState({ busy: true, error: null });
    const result = await this.service.inject({ refreshToken: this.state.refreshToken, userId: this.state.userId });
    const messages = {
      ok: null,
      invalid_input: 'Refresh token과 User ID를 모두 입력해 주세요.',
      rejected: '서버가 refresh token을 거절했어요.',
      failed: '요청에 실패했어요. 다시 시도해 주세요.',
    } as const;
    this.setState({ busy: false, error: messages[result.kind] });
    return result.kind === 'ok';
  }
}
