import { ViewModel } from '../../core/state/ViewModel';
import type { ToastController } from '../../core/ui/ToastController';
import type { SessionMode } from '../boot/authGate';
import type { TodayPost } from '../home/homeModels';
import type { GuestGate } from '../shell/GuestGate';
import type { UploadEntry } from '../shell/UploadEntry';
import type { UploadNavigator } from './UploadNavigator';

/** 게이트가 쓰는 GET /posts/today. HomeRepository.fetchTodayPost가 구현한다(404 → no-open-topic, 403 → banned, 계약 위반은 InvalidResponseError). */
export interface TodayPostSource {
  fetchTodayPost(signal?: AbortSignal): Promise<TodayPost>;
}

export interface UploadGateDeps {
  /** 지금 세션이 회원인지 게스트인지(저장소에서 읽는다). */
  mode: () => Promise<SessionMode>;
  guestGate: GuestGate;
  today: TodayPostSource;
  navigator: UploadNavigator;
  toast: ToastController;
}

export interface UploadGateState {
  /** GET /posts/today 확인 중. 이 동안 start()는 무시한다. */
  checking: boolean;
}

/**
 * 업로드 진입 게이트(REQ-UPL-001~007, 011). 하단 가운데 + 와 홈 히어로 Empty가 공유한다.
 * start(): 확인 중이면 무시(요청 1회, REQ-UPL-002) → 게스트면 nav.guest.upload(= upload.gate.login-required) 토스트, 요청 없음(D-05) →
 *   GET /posts/today 1회:
 *   · not-posted → navigator.openUpload({ topicDate: 응답의 topicDate })
 *   · posted(VALIDATING·PENDING·APPROVED 모두) → upload.gate.already-posted 토스트
 *   · no-open-topic → upload.gate.no-open-topic, banned → upload.gate.banned (같은 요청을 다시 보내지 않는다)
 *   · 401 → ApiClient가 갱신 후 1회 재시도하고, 재인증이 필요하면 세션 이벤트가 로그인 화면을 연다: 게이트는 토스트도 이동도 하지 않는다
 *   · 그 밖(네트워크, 5xx, 계약 위반) → upload.gate.check-failed
 * 끝나면 checking을 내리고 다시 start()할 수 있다. 어떤 경우에도 업로드 화면을 연 뒤에는 토스트를 띄우지 않는다.
 * cancel(): 확인 중인 요청을 abort하고 결과(토스트·이동)를 버린다. 그 뒤 start()는 다시 동작한다. dispose(): 영구 종료 — 이후 start()는 요청 0건.
 */
export class UploadGate extends ViewModel<UploadGateState> implements UploadEntry {
  constructor(protected readonly deps: UploadGateDeps) {
    super({ checking: false });
  }

  start(): void {
    throw new Error('not implemented');
  }

  cancel(): void {
    throw new Error('not implemented');
  }

  override dispose(): void {
    throw new Error('not implemented');
  }
}
