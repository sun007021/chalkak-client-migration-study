import type { ToastController } from '../../core/ui/ToastController';
import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import type { SessionMode } from '../boot/authGate';

const MESSAGE_KEYS: Readonly<Record<GuestRestriction, CopyKey>> = {
  record: 'nav.guest.record',
  upload: 'nav.guest.upload',
  feed: 'nav.guest.feed',
  like: 'nav.guest.like',
  notification: 'nav.guest.notification',
  feedback: 'nav.guest.feedback',
};

/** 게스트가 막히는 동작(D-05, REQ-NAV-013~018). */
export type GuestRestriction = 'record' | 'upload' | 'feed' | 'like' | 'notification' | 'feedback';

/**
 * 게스트 제한 판정(공용). 다른 화면은 동작을 시작하기 전에 requireMember를 부르고 false면 아무것도 하지 않는다.
 * 게스트면 nav.guest.<action> 토스트를 보이고 false. 회원이면 true(토스트 없음). 네트워크 요청은 하지 않는다(REQ-NAV-019).
 */
export class GuestGate {
  constructor(private readonly deps: { toast: ToastController }) {}

  requireMember(mode: SessionMode, action: GuestRestriction): boolean {
    if (mode === 'member') return true;
    this.deps.toast.show(t(MESSAGE_KEYS[action]));
    return false;
  }
}
