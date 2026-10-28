import type { UserDataCache } from '../../core/push/UserDataCache';
import type { AppVisibility } from '../../core/lifecycle/AppVisibility';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import { currentMonthKst, todayKst } from '../../core/time/kst';
import type { YearMonth } from '../../core/time/YearMonth';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { RecordRepository } from '../../data/record/RecordRepository';
import type { AuthFlowNavigator, MainMode } from '../auth/AuthFlowNavigator';
import type { PostChanges } from '../post/PostChanges';
import type { CalendarImageRenderer, CalendarImageSaver } from './CalendarImage';
import type { RecordNavigator } from './RecordNavigator';
import type { RecordState } from './RecordState';

export type RecordViewModelDeps = {
  /** 게스트는 API를 부르지 않는다(D-05). 탭 차단은 BottomTabPolicy가 하지만 방어적으로 한 번 더 막는다. */
  mode: MainMode;
  clock: Clock;
  records: RecordRepository;
  changes: PostChanges;
  navigator: RecordNavigator;
  toast: ToastPresenter;
  /** 남은 401(AuthenticationRequiredError) 오류 화면의 "로그인 하기"용. */
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
  visibility: AppVisibility;
  imageRenderer: CalendarImageRenderer;
  imageSaver: CalendarImageSaver;
};

export class RecordViewModel extends Observable<RecordState> implements UserDataCache {
  constructor(private readonly deps: RecordViewModelDeps) {
    const today = todayKst(deps.clock);
    const month = currentMonthKst(deps.clock);
    super({
      status: 'loading',
      error: null,
      month,
      currentMonth: month,
      today,
      availableMonths: [month],
      canGoPrevious: false,
      canGoNext: false,
      photos: [],
      selectedDate: null,
      selectedPhoto: null,
      revalidating: false,
      saving: false,
    });
  }

  /** 화면이 보인다(진입·복귀): 월 목록과 보는 달을 (재)조회하고 포그라운드 복귀·PostChanges 구독을 시작한다. */
  onShown(): Promise<void> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** 화면이 안 보인다: 진행 중 요청을 취소한다(오류로 보이지 않음, TC-REC-027). */
  onHidden(): void {
    throw new Error('not implemented');
  }

  /** 기록 탭 재선택: 재검증. */
  onTabReselected(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 홈 주간 기록 등이 날짜를 지정해 연다(null이면 지정 없음). 그 날짜에 사진이 있을 때만 선택한다(REQ-REC-032). */
  openDate(date: KstDate | null): Promise<void> {
    void date;
    throw new Error('not implemented');
  }

  goPrevious(): Promise<void> {
    throw new Error('not implemented');
  }

  goNext(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 월 선택. 선택된 달이거나 availableMonths에 없으면 아무 일도 없다(REQ-REC-006). */
  selectMonth(month: YearMonth): Promise<void> {
    void month;
    throw new Error('not implemented');
  }

  /** 연도 선택: 그 해에 기록이 있는 달 중 현재 달과 가장 가까운 달로 간다. 첫 해·마지막 해 밖은 끝으로 맞춘다(TC-REC-018). */
  selectYear(year: number): Promise<void> {
    void year;
    throw new Error('not implemented');
  }

  /** 사진이 있는 날짜만 선택된다. */
  selectDate(date: KstDate): void {
    void date;
    throw new Error('not implemented');
  }

  onViewFeed(): void {
    throw new Error('not implemented');
  }

  onViewDisplay(): void {
    throw new Error('not implemented');
  }

  /** 오류 화면의 "다시 시도". */
  retry(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 오류 화면의 "로그인 하기". */
  onLoginPress(): void {
    throw new Error('not implemented');
  }

  /** "이미지로 저장". 저장 중 연타는 무시한다. */
  saveImage(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 계정 전환·로그아웃: 캐시·삭제 기억·선택 날짜·진행 중 요청을 비운다. */
  clearAll(): void {
    throw new Error('not implemented');
  }

  override dispose(): void {
    super.dispose();
  }
}
