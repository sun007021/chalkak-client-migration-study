import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  NetworkError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import type { AppVisibility } from '../../core/lifecycle/AppVisibility';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import { currentMonthKst, todayKst, withCurrentMonth } from '../../core/time/kst';
import { YearMonth } from '../../core/time/YearMonth';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { RecordPhoto } from '../../data/record/RecordModels';
import type { RecordRepository } from '../../data/record/RecordRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator, MainMode } from '../auth/AuthFlowNavigator';
import type { PostChange, PostChanges } from '../post/PostChanges';
import {
  ImagePermissionDeniedError,
  isValidRenderedImage,
  type CalendarImageRenderer,
  type CalendarImageSaver,
} from './CalendarImage';
import type { RecordNavigator } from './RecordNavigator';
import type { RecordErrorKind, RecordState } from './RecordState';

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

/**
 * 기록 탭 상태. 월별 캐시, 세대 번호로 늦은 응답 폐기, 삭제한 게시물 기억을 맡는다.
 * 계정 전환 때 비우도록 UserDataCache를 구현하고, 소유자(RecordViewModelOwner)가 만들고 버린다.
 *
 * - PostChanges 구독은 생성부터 dispose까지 유지한다(상세가 위에 있어 기록이 가려진 동안에도 삭제를 반영해야 한다).
 * - 포그라운드 복귀 구독은 onShown~onHidden 동안만 둔다.
 * - 세대 번호(generation)는 월 이동·이탈·계정 전환 때 올라가고 낡은 세대의 응답은 화면에 쓰지 않는다.
 *   월 이동으로 밀려난 요청은 취소하지 않아(이탈·계정 전환만 abort) 끝까지 받아 캐시에 남긴다.
 * - 401 처리는 AuthErrorPolicy의 예외다(기록 한정, REQ-REC-024·041): 갱신 뒤에도 남은 401은 자동으로 로그인으로
 *   보내지 않고 "로그인이 필요해요" 오류 화면을 보여 주며 "로그인 하기"를 눌러야 이동한다.
 *   REAUTHENTICATION_REQUIRED는 정책과 같이 아무것도 하지 않는다(session-expired 이벤트가 로그인으로 보낸다).
 */
export class RecordViewModel extends Observable<RecordState> implements UserDataCache {
  /** 달별 서버 응답(삭제 걸러내기 전). 최신 응답으로 교체한다. */
  private readonly cache = new Map<string, readonly RecordPhoto[]>();
  /** 이 세션에서 삭제한 게시물. 늦은 응답이 되살리지 못하게 거른다(PostChanges.isDeleted와 함께 본다). */
  private readonly removedIds = new Set<string>();
  private serverMonths: readonly YearMonth[] = [];
  private generation = 0;
  private epoch = 0;
  private monthsSeq = 0;
  private controller = new AbortController();
  /** 홈 등이 지정한 날짜. 그 달 응답에 사진이 있을 때 선택하고(없으면 기본 선택) 한 번 쓰면 비운다. */
  private requestedDate: KstDate | null = null;
  /** 첫 진입에 현재 달로 맞췄는가. 아니면 onShown이 KST 현재 달로 맞춘다. */
  private anchored = false;
  private opening: Promise<void> | null = null;
  /** 저장 한 번의 식별자. 화면을 떠나거나 계정이 바뀌면 올려, 늦게 끝난 저장이 토스트를 띄우지 못하게 한다. */
  private saveToken = 0;
  private stopVisibility: (() => void) | null = null;
  private readonly stopChanges: () => void;

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
    this.stopChanges = deps.changes.subscribe((change) => this.onPostChange(change));
  }

  private get isMember(): boolean {
    return this.deps.mode === 'member';
  }

  /** 화면이 보인다(진입·복귀): 월 목록과 보는 달을 (재)조회하고 포그라운드 복귀 구독을 시작한다. */
  onShown(): Promise<void> {
    if (!this.isMember) return Promise.resolve();
    this.stopVisibility ??= this.deps.visibility.subscribe((state) => {
      if (state === 'foreground') void this.enter();
    });
    // openDate가 이미 시작한 진입이 있으면 그것을 이어받는다(같은 달을 두 번 요청하지 않는다).
    return this.opening ?? this.enter();
  }

  /** 화면이 안 보인다: 진행 중 요청을 취소한다(오류로 보이지 않음, TC-REC-027). */
  onHidden(): void {
    this.stopVisibility?.();
    this.stopVisibility = null;
    this.opening = null;
    this.invalidate(true);
    // 진행 중인 저장은 멈출 수 없지만(렌더러·저장소에 취소가 없다) 결과 토스트는 띄우지 않는다(D-20).
    this.cancelSave();
    if (this.getSnapshot().revalidating) this.patch({ revalidating: false });
  }

  private cancelSave(): void {
    this.saveToken += 1;
    if (this.getSnapshot().saving) this.patch({ saving: false });
  }

  /** 기록 탭 재선택: 재검증. */
  onTabReselected(): Promise<void> {
    return this.isMember ? this.enter() : Promise.resolve();
  }

  /** 홈 주간 기록 등이 날짜를 지정해 연다(null이면 지정 없음). 그 날짜에 사진이 있을 때만 선택한다(REQ-REC-032). */
  openDate(date: KstDate | null): Promise<void> {
    if (!this.isMember || date === null) return Promise.resolve();
    this.requestedDate = date;
    this.anchored = true;
    const opening = this.enter();
    this.opening = opening;
    void opening.finally(() => {
      if (this.opening === opening) this.opening = null;
    });
    return opening;
  }

  goPrevious(): Promise<void> {
    const s = this.getSnapshot();
    // availableMonths는 최신순이다: 보는 달보다 오래된 첫 달이 바로 이전 달.
    const target = s.availableMonths.find((m) => m.compare(s.month) < 0);
    return target ? this.move(target) : Promise.resolve();
  }

  goNext(): Promise<void> {
    const s = this.getSnapshot();
    const newer = s.availableMonths.filter((m) => m.compare(s.month) > 0);
    const target = newer.at(-1);
    return target ? this.move(target) : Promise.resolve();
  }

  /** 월 선택. 선택된 달이거나 availableMonths에 없으면 아무 일도 없다(REQ-REC-006). */
  selectMonth(month: YearMonth): Promise<void> {
    const s = this.getSnapshot();
    if (month.equals(s.month) || !s.availableMonths.some((m) => m.equals(month))) {
      return Promise.resolve();
    }
    return this.move(month);
  }

  /** 사진이 있는 날짜만 선택된다. */
  selectDate(date: KstDate): void {
    const s = this.getSnapshot();
    if (!s.photos.some((p) => p.date.equals(date))) return;
    this.requestedDate = null;
    if (s.selectedDate?.equals(date)) return;
    this.patch({ selectedDate: date });
  }

  onViewFeed(): void {
    const photo = this.getSnapshot().selectedPhoto;
    if (photo?.status !== 'APPROVED') return;
    this.deps.navigator.openPostDetail({ postId: photo.postId, thumbnailUrl: photo.thumbnailUrl });
  }

  onViewDisplay(): void {
    const photo = this.getSnapshot().selectedPhoto;
    if (photo?.status !== 'APPROVED') return;
    this.deps.navigator.openDisplay(photo.date);
  }

  /** 오류 화면의 "다시 시도". */
  retry(): Promise<void> {
    return this.isMember ? this.enter() : Promise.resolve();
  }

  /** 오류 화면의 "로그인 하기". */
  onLoginPress(): void {
    this.deps.authFlow.toLogin();
  }

  /** "이미지로 저장". 저장 중 연타는 무시한다. */
  async saveImage(): Promise<void> {
    const s = this.getSnapshot();
    if (s.saving || s.status !== 'content') return;
    this.saveToken += 1;
    const token = this.saveToken;
    const stale = () => token !== this.saveToken;
    this.patch({ saving: true });
    let message: string;
    try {
      const image = await this.deps.imageRenderer.render({
        month: s.month,
        photos: s.photos,
        today: s.today,
      });
      if (!isValidRenderedImage(image)) throw new Error('렌더 결과가 PNG 이미지가 아님');
      await this.deps.imageSaver.save({
        fileName: `chalkak-calendar-${s.month.toString()}.png`,
        bytes: image.bytes,
      });
      message = t('record.save.ok');
    } catch (error) {
      message =
        error instanceof ImagePermissionDeniedError
          ? t('record.save.denied')
          : t('record.save.fail');
    }
    // 화면을 떠났거나 계정이 바뀐 뒤에 끝난 저장은 상태도 토스트도 건드리지 않는다.
    if (stale()) return;
    this.patch({ saving: false });
    this.deps.toast.show(message);
  }

  /** 계정 전환·로그아웃: 캐시·삭제 기억·선택 날짜·진행 중 요청을 비운다. */
  clearAll(): void {
    this.invalidate(true);
    this.saveToken += 1;
    this.epoch += 1;
    this.monthsSeq += 1;
    this.cache.clear();
    this.removedIds.clear();
    this.serverMonths = [];
    this.requestedDate = null;
    this.anchored = false;
    this.opening = null;
    const today = todayKst(this.deps.clock);
    const month = currentMonthKst(this.deps.clock);
    this.setState({
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

  override dispose(): void {
    this.invalidate(true);
    this.stopVisibility?.();
    this.stopVisibility = null;
    this.stopChanges();
    super.dispose();
  }

  // ---- 진입·이동 ----

  /**
   * 화면 진입·포그라운드 복귀·탭 재선택·다시 시도의 공통 경로: 현재 달을 다시 계산하고 월 목록과 보는 달을 (재)조회한다.
   * 지정 날짜가 있는데 그 달이 아직 선택지에 없으면 월 목록이 온 뒤에 이동한다(그동안은 로딩 표시이고, 현재 달을 먼저
   * 불러 두지 않는다: 달을 두 번 요청하고 화면이 두 번 바뀌는 비용이 커서 현재 동작을 유지한다).
   */
  private enter(): Promise<void> {
    if (!this.isMember) return Promise.resolve();
    this.refreshClock();
    if (!this.anchored) {
      this.anchored = true;
      const { currentMonth } = this.getSnapshot();
      if (!this.getSnapshot().month.equals(currentMonth)) this.patch({ month: currentMonth });
    }
    const monthsDone = this.refreshMonths();
    const wanted = this.requestedMonth();
    if (wanted !== null && !this.isAvailable(wanted)) {
      const token = this.generation;
      return monthsDone.then(() => {
        if (token !== this.generation) return;
        const month = this.requestedMonth();
        if (month === null || !this.isAvailable(month)) {
          this.requestedDate = null;
          return this.begin(this.getSnapshot().month);
        }
        return this.begin(month);
      });
    }
    return Promise.all([monthsDone, this.begin(wanted ?? this.getSnapshot().month)]).then(
      () => undefined,
    );
  }

  /** 사용자가 달을 옮겼다. 홈이 지정한 날짜는 더 이상 유효하지 않다. */
  private move(month: YearMonth): Promise<void> {
    this.requestedDate = null;
    return this.begin(month);
  }

  private requestedMonth(): YearMonth | null {
    return this.requestedDate === null ? null : YearMonth.from(this.requestedDate);
  }

  private isAvailable(month: YearMonth): boolean {
    return this.getSnapshot().availableMonths.some((m) => m.equals(month));
  }

  /** 낡은 응답을 버리게 세대를 올린다. abort=true(이탈·계정 전환·dispose)면 요청도 취소한다. */
  private invalidate(abort: boolean): void {
    this.generation += 1;
    if (abort) {
      this.controller.abort();
      this.controller = new AbortController();
    }
  }

  /** 월을 보여 준다: 캐시가 있으면 먼저 보여 주고(재검증 중), 없으면 비우고 로딩. 그다음 서버에서 받는다. */
  private begin(month: YearMonth): Promise<void> {
    this.invalidate(false);
    const { generation, epoch } = this;
    const signal = this.controller.signal;
    const cached = this.cache.get(month.toString());
    if (cached) {
      this.showContent(month, cached, { revalidating: true });
    } else {
      this.patch({
        month,
        status: 'loading',
        error: null,
        photos: [],
        selectedDate: null,
        revalidating: false,
      });
    }
    return this.fetchMonth(month, generation, epoch, signal);
  }

  private async fetchMonth(
    month: YearMonth,
    generation: number,
    epoch: number,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const result = await this.deps.records.getCalendar(month, signal);
      if (epoch !== this.epoch) return;
      // 밀려난 요청의 응답도 캐시에는 남긴다(다시 그 달로 오면 바로 보인다).
      this.cache.set(month.toString(), result.photos);
      if (generation !== this.generation) return;
      this.showContent(month, result.photos, { revalidating: false });
    } catch (error) {
      if (generation !== this.generation || error instanceof CancelledError) return;
      this.onFailure(error);
    }
  }

  private onFailure(error: unknown): void {
    // REAUTHENTICATION_REQUIRED: 세션이 이미 지워졌고 session-expired 이벤트가 로그인으로 보낸다. 화면은 아무것도 하지 않는다.
    if (error instanceof ReauthenticationRequiredError) {
      if (this.getSnapshot().revalidating) this.patch({ revalidating: false });
      return;
    }
    if (this.getSnapshot().status === 'content') {
      // 보이는 내용이 있다: 유지하고 토스트만(REQ-REC-025).
      this.patch({ revalidating: false });
      this.deps.toast.show(this.toastOf(error));
      return;
    }
    this.patch({
      status: 'error',
      error: this.errorKindOf(error),
      photos: [],
      selectedDate: null,
      revalidating: false,
    });
  }

  private errorKindOf(error: unknown): RecordErrorKind {
    if (error instanceof AuthenticationRequiredError) return 'login-required';
    if (error instanceof HttpError && error.status === 400) return 'invalid-month';
    // 403(정지, D-08)의 전용 오류 화면은 백엔드 확인 전이라 일반 오류로 둔다. 확정되면 여기에 'forbidden' 분기를 넣는다.
    if (error instanceof HttpError && error.status === 403) return 'generic';
    return 'generic';
  }

  private toastOf(error: unknown): string {
    if (error instanceof NetworkError) return t('common.error.network');
    if (error instanceof AuthenticationRequiredError) return t('record.err.401');
    return t('record.err.other');
  }

  // ---- 월 목록·시계 ----

  /** 월 목록을 다시 받는다. 실패해도 현재 달이 선택지에 있어 조용히 넘어간다(REQ-REC-008). */
  private async refreshMonths(): Promise<void> {
    this.monthsSeq += 1;
    const { monthsSeq: seq, epoch } = this;
    try {
      const months = await this.deps.records.getMonths(this.controller.signal);
      if (epoch !== this.epoch || seq !== this.monthsSeq) return;
      this.serverMonths = months;
      this.refreshClock();
    } catch {
      // 월 목록 실패는 화면에 보이지 않는다.
    }
  }

  /** KST 오늘·현재 달과 월 선택지를 다시 계산한다(D-19). 보던 달과 선택한 날짜는 건드리지 않는다. */
  private refreshClock(): void {
    const s = this.getSnapshot();
    const today = todayKst(this.deps.clock);
    const currentMonth = currentMonthKst(this.deps.clock);
    const availableMonths = withCurrentMonth(this.serverMonths, currentMonth);
    const same =
      s.today.equals(today) &&
      s.currentMonth.equals(currentMonth) &&
      s.availableMonths.length === availableMonths.length &&
      s.availableMonths.every((m, index) => m.equals(availableMonths[index]));
    if (!same) this.patch({ today, currentMonth, availableMonths });
  }

  // ---- 삭제 반영 ----

  private onPostChange(change: PostChange): void {
    if (change.kind !== 'deleted') return;
    this.removedIds.add(change.postId);
    const s = this.getSnapshot();
    if (s.status !== 'content' || !s.photos.some((p) => p.postId === change.postId)) return;
    const raw = this.cache.get(s.month.toString());
    if (raw) this.showContent(s.month, raw, {});
  }

  private isRemoved(postId: string): boolean {
    return this.removedIds.has(postId) || this.deps.changes.isDeleted(postId);
  }

  // ---- 상태 조립 ----

  /** 한 달 응답을 화면에 올린다. 지정 날짜(requestedDate)는 그 달 응답을 한 번 적용하면 소모한다. */
  private showContent(
    month: YearMonth,
    raw: readonly RecordPhoto[],
    extra: Partial<RecordState>,
  ): void {
    const photos = raw.filter((p) => !this.isRemoved(p.postId));
    const selectedDate = this.resolveSelection(month, photos);
    const requested = this.requestedDate;
    if (requested !== null && YearMonth.from(requested).equals(month)) this.requestedDate = null;
    this.patch({ month, status: 'content', error: null, photos, selectedDate, ...extra });
  }

  /**
   * 선택 날짜를 정한다(부수 효과 없음). 홈이 지정한 날짜(그 날짜에 사진이 있을 때만) > 지금 선택한 날짜(아직 있으면)
   * > 가장 늦은 사진 날짜 > 없음.
   */
  private resolveSelection(month: YearMonth, photos: readonly RecordPhoto[]): KstDate | null {
    const has = (date: KstDate | null): date is KstDate =>
      date !== null && photos.some((p) => p.date.equals(date));
    const requested = this.requestedDate;
    if (requested !== null && YearMonth.from(requested).equals(month) && has(requested)) {
      return requested;
    }
    const current = this.getSnapshot().selectedDate;
    if (has(current)) return current;
    return photos.at(-1)?.date ?? null;
  }

  /** 상태를 바꾸는 유일한 통로: 선택한 사진과 이전·다음 달 가능 여부를 항상 함께 맞춘다. */
  private patch(next: Partial<RecordState>): void {
    this.setState((cur) => {
      const merged = { ...cur, ...next };
      const { month, availableMonths, photos, selectedDate } = merged;
      return {
        ...merged,
        selectedPhoto:
          selectedDate === null ? null : (photos.find((p) => p.date.equals(selectedDate)) ?? null),
        canGoPrevious: availableMonths.some((m) => m.compare(month) < 0),
        canGoNext: availableMonths.some((m) => m.compare(month) > 0),
      };
    });
  }
}
