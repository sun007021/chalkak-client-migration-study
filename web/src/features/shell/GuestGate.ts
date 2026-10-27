import type { ToastController } from '../../core/ui/ToastController';
import type { SessionMode } from '../boot/authGate';

/** 게스트가 막히는 동작(D-05, REQ-NAV-013~018). */
export type GuestRestriction = 'record' | 'upload' | 'feed' | 'like' | 'notification' | 'feedback';

/**
 * 게스트 제한 판정(공용). 다른 화면은 동작을 시작하기 전에 requireMember를 부르고 false면 아무것도 하지 않는다.
 * 게스트면 nav.guest.<action> 토스트를 보이고 false. 회원이면 true(토스트 없음). 네트워크 요청은 하지 않는다(REQ-NAV-019).
 */
export class GuestGate {
  constructor(_deps: { toast: ToastController }) {}

  requireMember(_mode: SessionMode, _action: GuestRestriction): boolean {
    throw new Error('not implemented');
  }
}
