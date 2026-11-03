import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import type { SessionMode } from '../boot/authGate';
import type { PostChanges } from '../post/PostChanges';
import type { CalendarImageExporter } from './CalendarImageExporter';
import type { FileDownloader } from './FileDownloader';
import type { RecordNavigator } from './recordNavigation';
import type { CalendarPost, YearMonth } from './recordModels';
import type { RecordRepository } from './RecordRepository';

const NOT_IMPLEMENTED = 'not implemented';

/** 오류 화면의 종류: unauthorized(401), invalid-month(400), network(연결 실패·타임아웃), other(그 밖: 5xx·403·계약 위반). */
export type RecordErrorKind = 'unauthorized' | 'invalid-month' | 'network' | 'other';

export type RecordBody =
  /** 캐시 없는 달의 첫 불러오기 중(이전 달 내용은 비운다). 화면 이탈로 취소된 첫 조회도 오류가 아니라 이 상태로 남는다. */
  | { status: 'loading' }
  /** 캐시 없는 달의 첫 불러오기 실패(REQ-REC-024). 달력 내용은 비운다. */
  | { status: 'error'; kind: RecordErrorKind }
  /** posts는 topicDate 오름차순. 비어 있으면 빈 달(오류 아님). revalidating은 캐시를 보여 주며 서버에 다시 확인하는 중. */
  | { status: 'ready'; posts: CalendarPost[]; revalidating: boolean };

export interface RecordState {
  mode: SessionMode;
  /** KST 오늘(자정·포그라운드 복귀 때 다시 계산한다). */
  today: DateString;
  /** KST 현재 달. */
  currentMonth: YearMonth;
  /** 서버 월 목록 ∪ 현재 달, 최신순(REQ-REC-002). */
  availableMonths: YearMonth[];
  /** 보고 있는(또는 불러오는 중인) 달. */
  month: YearMonth;
  /** 선택한 날짜. 사진이 있는 날만 가능하다(REQ-REC-030). 없으면 null. */
  selectedDate: DateString | null;
  /** selectedDate의 사진. */
  selectedPost: CalendarPost | null;
  /** 선택지의 가장 오래된 달이 아니면 true. */
  canGoPrevious: boolean;
  /** 선택지의 가장 최신 달이 아니면 true. */
  canGoNext: boolean;
  body: RecordBody;
  /** PENDING 배지 안내 풍선이 열려 있는가. */
  pendingHintOpen: boolean;
  /** 이미지 저장 중(연타 무시). */
  saving: boolean;
}

export interface RecordViewModelDeps {
  mode: SessionMode;
  clock: Clock;
  repository: RecordRepository;
  changes: PostChanges;
  toast: ToastController;
  navigator: RecordNavigator;
  exporter: CalendarImageExporter;
  downloader: FileDownloader;
}

/**
 * 기록 탭 로직(화면은 그리기만). 컨테이너가 모드별로 하나를 보관하고(recordSession) 화면은 붙었다 떨어진다: 피드·전시에 갔다 와도 달·날짜·캐시가 남는다.
 *
 * 규칙 요약(구현 단계의 근거)
 * - 월 선택지 = 서버 월 목록 ∪ KST 현재 달(최신순). 월 목록 실패는 조용히 현재 달만으로 진행한다(REQ-REC-008). 월 이동은 선택지 안에서만, 같은 달·선택지 밖은 무시(요청도 상태 변화도 없다).
 * - 달 단위 캐시: 캐시가 있으면 즉시 보여 주고(revalidating) 곧바로 다시 요청한다. 같은 달의 진행 중 요청은 공유한다(applyRoute와 onShown이 연달아 불려도 요청은 1건).
 *   최신 선택이 아닌 달의 늦은 응답은 화면을 덮지 않고 그 달의 캐시에만 남는다(REQ-REC-026). onHidden·계정 전환은 진행 중 요청을 취소/무효화한다.
 * - 실패: 캐시 없음 → error 본문(401 unauthorized, 400 invalid-month, 연결 실패 network, 그 밖 other), 캐시 있음 → 내용 유지 + 토스트(연결 실패는 common.error.network, 그 밖은 record.err.other).
 *   취소(AbortError)·SessionChangedError는 오류로 보이지 않는다(loading 유지).
 * - 선택 날짜: 달을 불러오면 기본은 그 달 최신 사진 날짜. 재검증·캐시 교체 때는 그 날짜가 아직 있으면 유지, 없으면 기본 규칙. URL 진입(applyRoute) 날짜는 그 날짜에 사진이 있을 때만 쓰고, 첫 조회가 실패해도 다시 시도에서 쓴다.
 * - changes: removed는 삭제 기억(changes.wasRemoved)으로 응답·캐시에서 거르고(보이는 달이면 즉시 선택 보정), created는 그 topicDate 달의 캐시를 버리고 보이는 중이면 조용히 다시 불러온다. 월 선택지는 삭제로 임의로 줄이지 않는다(REQ-REC-029).
 * - 게스트(mode=guest)는 어떤 API도 부르지 않는다(REQ-REC-040).
 */
export class RecordViewModel extends ViewModel<RecordState> {
  constructor(protected readonly deps: RecordViewModelDeps) {
    super({
      mode: deps.mode,
      today: '1970-01-01',
      currentMonth: { year: 1970, month: 1 },
      availableMonths: [],
      month: { year: 1970, month: 1 },
      selectedDate: null,
      selectedPost: null,
      canGoPrevious: false,
      canGoNext: false,
      body: { status: 'loading' },
      pendingHintOpen: false,
      saving: false,
    });
  }

  /** URL 진입 값 반영(마운트·Link·주소 변경). date가 null이면 아무것도 하지 않는다. 사진이 있는 날짜일 때만 그 달·날짜를 연다(REQ-REC-032). 같은 값이면 요청도 상태 변화도 없다. */
  applyRoute(_route: { date: DateString | null }): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 화면이 보일 때(첫 진입·탭 복귀·포그라운드 복귀): 현재 달을 다시 계산하고(보던 달·날짜는 유지) 월 목록과 보이는 달을 재검증한다. 첫 진입이면 현재 달을 연다. 자정 감시를 시작한다. */
  onShown(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 화면 이탈·문서 숨김: 진행 중 요청을 취소하고 자정 감시를 멈춘다. 첫 조회가 취소돼도 오류가 아니다. */
  onHidden(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 이전 달(선택지에서 한 칸 오래된 달). 가장 오래된 달이면 아무 일도 없다. */
  selectPreviousMonth(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 다음 달(선택지에서 한 칸 최신 달). 가장 최신 달이면 아무 일도 없다. */
  selectNextMonth(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 월 선택. 보고 있는 달이거나 선택지에 없는 달이면 아무 일도 없다(REQ-REC-006). */
  selectMonth(_ym: YearMonth): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 날짜 선택. 사진이 없는 날짜·다른 달의 날짜는 아무 일도 없다(REQ-REC-030). */
  selectDate(_date: DateString): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 오류 화면의 다시 시도(첫 불러오기부터). */
  retry(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 기록 탭 재선택: 보이는 달을 재검증한다(기존 내용 유지). */
  onTabReselect(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** PENDING 배지 안내 풍선 열기/닫기. */
  togglePendingHint(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** "피드에서 보기": 선택한 APPROVED 사진을 내 게시물로 연다. PENDING·선택 없음이면 아무 일도 없다. */
  openFeed(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** "전시 보러가기": 선택한 APPROVED 사진의 topicDate로 전시를 연다. PENDING·선택 없음이면 아무 일도 없다. */
  openDisplay(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * "이미지로 저장": 보고 있는 달의 이미지 모델을 exporter로 PNG로 그려(시그니처·가로세로 검증) `chalkak-calendar-{yyyy-MM}.png`로 downloader에 넘기고 성공 토스트를 한 번 보인다.
   * 저장 중 호출은 무시한다. SaveDeniedError는 record.save.denied, 그 밖의 실패(렌더·PNG 검증·다운로드)는 record.save.fail 토스트. 앱은 멈추지 않는다.
   */
  saveImage(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** 계정 전환·로그아웃: 월별 캐시·월 선택지·선택 날짜·진행 중 요청을 모두 버리고 처음 상태로 돌린다(보이는 중이면 곧바로 다시 불러온다). */
  resetForAccountChange(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  override dispose(): void {
    throw new Error(NOT_IMPLEMENTED);
  }
}
