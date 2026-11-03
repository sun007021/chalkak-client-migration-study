import type { Clock } from '../../core/time/Clock';
import type { ToastController } from '../../core/ui/ToastController';
import type { AiReviewEntry } from './aiReviewModels';
import type { AiReviewRepository } from './AiReviewRepository';

export interface AiReviewStoreDeps {
  repository: AiReviewRepository;
  /** 폴링 간격은 clock.sleep, 창은 monotonicMs로 잰다(Date.now·setTimeout 금지). */
  clock: Clock;
  /** 요청·폴링 오류 문구(`ai.error.*`)를 토스트로 알린다. */
  toast: ToastController;
}

export interface AiWatchOptions {
  /**
   * 화면이 다시 보일 때 COMPLETED 결과도 GET으로 갱신할지. 상세는 true(REQ-AIR-051: 재진입하면 완료 결과도 갱신),
   * 홈은 false(같은 게시물의 완료 결과는 다시 조회하지 않고 유지, TC-AIR-018). 처리 중·NONE·FAILED는 어느 쪽이든 GET부터 다시 시작한다.
   */
  refreshCompleted: boolean;
  /** 요청 자격(내 게시물 + 주제 날짜가 KST 오늘). request() 시점에 다시 평가해 false면 POST를 보내지 않는다(REQ-AIR-003). 기본 () => true. */
  canRequest?: () => boolean;
}

/**
 * 한 화면(홈 카드 또는 상세 알약)이 한 게시물을 보는 손잡이. 같은 postId를 여러 화면이 동시에 붙잡아도 상태·폴링은 저장소의 게시물 하나가 공유한다.
 * 폴링은 보이는(show 된) 손잡이가 하나라도 있는 동안만 돈다.
 */
export interface AiReviewWatch {
  readonly postId: string;
  /**
   * 화면이 보인다(처음 붙을 때 포함). GET부터 보내고 응답이 반영되면 이행한다(폴링 루프는 기다리지 않는다).
   * 응답이 PROCESSING이면 이 시각부터 새 300초 창으로 3초 간격 폴링을 시작한다(REQ-AIR-026, 028).
   * 이미 보이는 상태에서 다시 부르면 아무 일도 없다. 404면 phase=hidden(메시지 없음), 오류면 첫 확인 전이면 check-failed + 토스트(이전 상태가 있으면 유지 + 토스트).
   */
  show(): Promise<void>;
  /** 화면이 가려진다(다른 화면·탭·백그라운드). 마지막 보이는 손잡이가 가려지면 폴링을 멈추고 진행 중이던 GET·POST 응답을 버린다(requesting도 false로). */
  hide(): void;
  /** "AI 상태 다시 확인": GET 1회. PROCESSING이면 새 300초 창으로 폴링을 재개한다(TC-AIR-037). 이전에 보낸 GET(폴링 포함)이 아직 진행 중이면 그 응답은 버린다(TC-AIR-043: 완료 결과를 덮지 않는다). */
  recheck(): Promise<void>;
  /**
   * POST 1회(본문 없음, 자동 재전송 없음). status가 NONE이거나 FAILED+canRequestAgain이고 canRequest()가 true이며 requesting·blocked가 아닐 때만 보낸다(그 밖에는 아무 일도 없다).
   * POST 응답이 반영되면(오류 뒤 GET 동기화가 있으면 그 GET까지) 이행한다. 폴링 루프는 기다리지 않는다. PROCESSING → 이번 POST 시각부터 새 창으로 폴링(보이는 상태일 때), COMPLETED/FAILED → 그 상태(폴링 없음, 시트는 열지 않음).
   * 오류: 400 → 서버 message 토스트(상태 유지), 403 → `ai.error.banned` + blocked, 404 → hidden + `ai.error.not-found`, 401 → `ai.error.login`,
   * 연결 오류 → `ai.error.network` 후 GET 동기화, 5xx·검증 실패 → `ai.error.load` 후 GET 동기화(둘 다 POST 재전송 없음), 409 → 토스트 없이 GET 동기화.
   */
  request(): Promise<void>;
  /** 손잡이를 놓는다(hide 포함). 마지막 손잡이여도 게시물 상태는 캐시로 남는다. */
  release(): void;
}

/**
 * AI 피드백 공용 저장소(Android AiReviewSession 방식, 홈 카드·상세 알약 공용). 계정 전환 때 UserCaches가 reset한다.
 * 게시물마다 AiReviewEntry 하나를 갖고, 화면은 watch()로 붙어 show/hide로 가시성을 알린다.
 * 늦게 도착한 응답(화면 이탈 뒤, 수동 갱신 뒤의 이전 폴링, 다른 게시물, reset 뒤)은 상태를 바꾸지 않는다(StaleGuard).
 * 폴링: 3초 간격(`AI_REVIEW_POLL_INTERVAL_MS`), 창 300초(`AI_REVIEW_POLL_WINDOW_MS`), 창 시작 후 경과가 300초 이상이면 GET 없이 stalled(PROCESSING 유지) + 안내.
 * 동시에 두 GET을 보내지 않는다. 폴링 GET 일시 오류는 계속 폴링하고 토스트는 한 번만, 404는 hidden으로 멈추고 메시지 없음, 401은 멈추고 `ai.error.login`.
 */
export class AiReviewStore {
  constructor(protected readonly deps: AiReviewStoreDeps) {}

  /** 게시물의 현재 상태. 한 번도 붙은 적이 없으면 null. 같은 상태면 같은 참조를 돌려준다(useSyncExternalStore용). */
  entry(_postId: string): AiReviewEntry | null {
    throw new Error('not implemented');
  }

  /** 어느 게시물이든 상태가 바뀔 때 부른다. 해제 함수를 돌려준다. */
  subscribe(_listener: () => void): () => void {
    throw new Error('not implemented');
  }

  watch(_postId: string, _options: AiWatchOptions): AiReviewWatch {
    throw new Error('not implemented');
  }

  /** 계정 전환·로그아웃: 모든 상태를 지우고 폴링을 멈추며 진행 중 응답을 버린다. 이미 만든 손잡이는 다시 show하면 새로 시작한다. */
  reset(): void {
    throw new Error('not implemented');
  }
}
