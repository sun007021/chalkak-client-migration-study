import {
  AuthenticationRequiredError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';

/**
 * 홈·전시·피드·좋아요가 공유하는 401 처리 정책(한 곳에서만 바꾼다).
 * - ReauthenticationRequiredError(401 REAUTHENTICATION_REQUIRED): 세션이 이미 지워졌고 session-expired 이벤트가
 *   부트 흐름을 로그인으로 보낸다. 화면은 아무것도 하지 않는다(로그인 이동·토스트·오류 상태 없음).
 * - AuthenticationRequiredError(갱신·재전송 뒤에도 남은 401): 세션은 지우지 않고 화면이 로그인으로 보낸다
 *   (임시 동작: boot-auth.md 확인 필요 5, REQ-NET-023). 같은 `key`에서는 한 번만 보낸다.
 */
export class AuthErrorPolicy {
  private requestedKey: unknown = undefined;

  constructor(private readonly authFlow: Pick<AuthFlowNavigator, 'toLogin'>) {}

  /** 인증 오류면 처리하고 true(호출자는 오류 상태·토스트를 만들지 않는다). 아니면 false. */
  handle(error: unknown, key: unknown = null): boolean {
    if (error instanceof ReauthenticationRequiredError) return true;
    if (!(error instanceof AuthenticationRequiredError)) return false;
    if (this.requestedKey !== key) {
      this.requestedKey = key;
      this.authFlow.toLogin();
    }
    return true;
  }
}
