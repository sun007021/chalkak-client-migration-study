import { ViewModel } from '../../core/state/ViewModel';
import { NetworkError } from '../../core/net/errors';
import type { Banner, BannerPage } from './homeModels';
import type { BannerRepository } from './BannerRepository';

export interface BannerFeedReady {
  status: 'ready';
  /** 비면 ISSUE 섹션을 숨긴다(REQ-BANR-005). */
  banners: Banner[];
  hasNext: boolean;
  loadingMore: boolean;
  /** 다음에 요청할 페이지 번호. */
  nextPage: number;
  /** 추가 페이지 요청이 실패했다. 목록은 유지하고 목록 끝의 다시 시도 버튼으로만 같은 페이지를 재요청한다(스크롤로는 재요청하지 않음). */
  moreFailed?: boolean;
}

export type BannerFeedState = { status: 'loading' } | { status: 'error' } | BannerFeedReady;

/** 새로고침 실패 결과. 취소·성공이면 null. */
export type BannerRefreshFailure = { network: boolean } | null;

const isAbort = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';

/** 같은 id는 먼저 온 것만 남긴다(REQ-BANR-009). */
function mergeUnique(existing: Banner[], incoming: Banner[]): Banner[] {
  const seen = new Set(existing.map((b) => b.id));
  const out = [...existing];
  for (const banner of incoming) {
    if (seen.has(banner.id)) continue;
    seen.add(banner.id);
    out.push(banner);
  }
  return out;
}

interface Pass {
  signal: AbortSignal;
  isCurrent(): boolean;
}

/**
 * 홈 ISSUE 섹션의 목록·페이징(REQ-BANR-007~011). 홈 ViewModel이 load/refresh를 부른다.
 * 1페이지 요청(load/refresh/cancel/reset)과 추가 페이지 요청은 번호가 따로다: 추가 페이지 요청이 시작돼도 진행 중인 1페이지 요청을 취소하지 않고,
 * 1페이지 요청이 시작되면 진행 중인 추가 페이지 응답은 버려진다. 새로고침 중에는 새 추가 페이지 요청을 시작하지 않는다.
 */
export class BannerFeed extends ViewModel<BannerFeedState> {
  private firstEpoch = 0;
  private moreEpoch = 0;
  private firstController: AbortController | null = null;
  private moreController: AbortController | null = null;
  private firstPageInFlight = false;

  constructor(protected readonly deps: { repository: BannerRepository }) {
    super({ status: 'loading' });
  }

  private beginFirst(): Pass {
    this.firstController?.abort();
    this.cancelMore();
    const controller = new AbortController();
    this.firstController = controller;
    const mine = ++this.firstEpoch;
    this.firstPageInFlight = true;
    return { signal: controller.signal, isCurrent: () => this.firstEpoch === mine };
  }

  private endFirst(pass: Pass): void {
    if (pass.isCurrent()) this.firstPageInFlight = false;
  }

  /** 추가 페이지 요청만 무효화한다. */
  private cancelMore(): void {
    this.moreController?.abort();
    this.moreController = null;
    this.moreEpoch += 1;
    this.patchReady({ loadingMore: false });
  }

  /** ready일 때만 일부 필드를 바꾼다. */
  private patchReady(patch: Partial<Omit<BannerFeedReady, 'status'>>): void {
    const current = this.state;
    if (current.status !== 'ready') return;
    if (!(Object.keys(patch) as (keyof typeof patch)[]).some((key) => !Object.is(patch[key], current[key]))) return;
    this.replaceState({ ...current, ...patch });
  }

  private ready(page: BannerPage): BannerFeedReady {
    return { status: 'ready', banners: mergeUnique([], page.banners), hasNext: page.hasNext, loadingMore: false, nextPage: 2 };
  }

  /** 1페이지를 불러온다. 실패하면 error(재호출하면 loading을 거쳐 다시). 같은 id는 한 번만. */
  async load(): Promise<void> {
    const pass = this.beginFirst();
    this.replaceState({ status: 'loading' });
    try {
      const page = await this.deps.repository.list(1, pass.signal);
      if (!pass.isCurrent()) return;
      this.replaceState(this.ready(page));
    } catch (error) {
      if (!pass.isCurrent() || isAbort(error)) return;
      this.replaceState({ status: 'error' });
    } finally {
      this.endFirst(pass);
    }
  }

  /** 새 1페이지로 교체(빈 성공이면 비움). 실패하면 기존 목록 유지하고 실패 종류를 돌려준다. 취소면 null. 늦게 온 추가 페이지 응답은 버린다. */
  async refresh(): Promise<BannerRefreshFailure> {
    const pass = this.beginFirst();
    try {
      const page = await this.deps.repository.list(1, pass.signal);
      if (!pass.isCurrent()) return null;
      this.replaceState(this.ready(page));
      return null;
    } catch (error) {
      if (!pass.isCurrent() || isAbort(error)) return null;
      if (this.state.status === 'loading') this.replaceState({ status: 'error' });
      return { network: error instanceof NetworkError };
    } finally {
      this.endFirst(pass);
    }
  }

  /** 목록 끝 근처의 센티넬이 화면에 들어왔다(IntersectionObserver). 다음 페이지를 요청한다. 마운트 직후 이미 보이고 있어도 호출된다. */
  onSentinelVisible(): Promise<void> {
    return this.requestMore(false);
  }

  /** (스크롤 위치 신호용. 화면은 센티넬을 쓴다.) 목록에서 마지막으로 보이는 카드의 인덱스. total-2 이내이고 hasNext이며 로딩 중이 아니면 nextPage를 요청한다. 실패하면 같은 페이지로 재시도 가능. 빈 추가 페이지는 hasNext=false. */
  async onLastVisibleIndexChanged(index: number): Promise<void> {
    const current = this.state;
    if (current.status !== 'ready' || index < current.banners.length - 2) return;
    await this.requestMore(true); // 사용자가 목록 끝으로 직접 스크롤한 신호라 실패 뒤 재요청도 허용한다
  }

  /** 추가 페이지 실패 뒤 목록 끝의 다시 시도 버튼. 같은 페이지 번호를 다시 요청한다. */
  retryMore(): Promise<void> {
    return this.requestMore(true);
  }

  private async requestMore(isRetry: boolean): Promise<void> {
    const current = this.state;
    if (current.status !== 'ready' || !current.hasNext || current.loadingMore || this.firstPageInFlight) return;
    if (current.moreFailed && !isRetry) return; // 실패 뒤에는 버튼으로만 다시 요청한다
    this.moreController?.abort();
    const controller = new AbortController();
    this.moreController = controller;
    const mine = ++this.moreEpoch;
    const firstAtStart = this.firstEpoch;
    const isCurrent = () => this.moreEpoch === mine && this.firstEpoch === firstAtStart;
    this.patchReady({ loadingMore: true, moreFailed: false });
    try {
      const page = await this.deps.repository.list(current.nextPage, controller.signal);
      if (!isCurrent()) return;
      const latest = this.state;
      if (latest.status !== 'ready') return;
      this.replaceState({
        ...latest,
        banners: mergeUnique(latest.banners, page.banners),
        hasNext: page.banners.length > 0 && page.hasNext,
        nextPage: latest.nextPage + 1,
        loadingMore: false,
        moreFailed: false,
      });
    } catch (error) {
      if (!isCurrent() || isAbort(error)) return;
      this.patchReady({ loadingMore: false, moreFailed: true });
    }
  }

  /** 진행 중인 요청을 무효화(화면 이탈). 도착한 응답은 상태를 바꾸지 않는다. */
  cancelPending(): void {
    this.firstController?.abort();
    this.firstController = null;
    this.firstEpoch += 1;
    this.firstPageInFlight = false;
    this.cancelMore();
  }

  /** loading으로 되돌린다(계정 전환·새 홈 진입). */
  reset(): void {
    this.cancelPending();
    this.replaceState({ status: 'loading' });
  }

  override dispose(): void {
    this.cancelPending();
    super.dispose();
  }
}
