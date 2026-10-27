import type { Banner } from '../../data/banner/Banner';
import type { BannerRepository } from '../../data/banner/BannerRepository';
import { CancelledError, NetworkError } from '../../core/http/ApiError';
import { Observable } from '../../core/state/Observable';

/**
 * 첫 페이지: loading -> ready | error. ready의 banners가 비어 있으면 ISSUE 섹션 전체를 숨긴다(REQ-BANR-005).
 * error는 "최초 조회 실패"만이다(REQ-BANR-006). 새로고침·추가 페이지 실패는 ready를 유지한다.
 */
export type BannerFeedState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      banners: readonly Banner[];
      /** 마지막 페이지(또는 빈 추가 페이지)에 닿으면 false가 되어 새로고침 전까지 요청하지 않는다. */
      hasNext: boolean;
      loadingMore: boolean;
    };

/** 새로고침이 실패한 섹션 정보. network면 토스트 문구는 common.error.network(D-20). */
export type SectionFailure = { network: boolean };

export type BannerFeedDeps = { repository: BannerRepository };

/** 홈 ISSUE 섹션의 목록·페이징(BANNER_PAGE_SIZE씩 누적). 인증 없이 부른다. */
export class BannerFeedViewModel extends Observable<BannerFeedState> {
  /** 새로고침·취소·초기화마다 올라간다. 요청을 보낸 시점의 값과 다르면 그 응답은 낡았으므로 버린다. */
  private generation = 0;
  private controller = new AbortController();
  private nextPage = 2;
  private loadInFlight: Promise<void> | null = null;
  private refreshing = false;

  constructor(private readonly deps: BannerFeedDeps) {
    super({ status: 'loading' });
  }

  /** 1페이지를 불러온다(홈 최초 로드, 최초 실패 뒤 다시 시도). 이미 ready이면 아무것도 하지 않는다. */
  load(): Promise<void> {
    if (this.getSnapshot().status === 'ready' || this.refreshing) return Promise.resolve();
    if (this.loadInFlight) return this.loadInFlight;
    const run = this.runLoad().finally(() => {
      if (this.loadInFlight === run) this.loadInFlight = null;
    });
    this.loadInFlight = run;
    return run;
  }

  private async runLoad(): Promise<void> {
    const token = this.generation;
    this.setState({ status: 'loading' });
    try {
      const page = await this.deps.repository.list(1, this.controller.signal);
      if (token !== this.generation) return;
      this.nextPage = 2;
      this.setState({
        status: 'ready',
        banners: page.banners,
        hasNext: page.hasNext && page.banners.length > 0,
        loadingMore: false,
      });
    } catch (error) {
      if (token !== this.generation || error instanceof CancelledError) return;
      this.setState({ status: 'error' });
    }
  }

  /**
   * 새로고침(당겨서·복귀 갱신). 기존 목록을 유지한 채 1페이지를 받아 교체하고 다음 요청을 2페이지부터 다시 시작한다.
   * 빈 성공이면 목록을 비운다. 실패하면 목록을 유지하고 실패를 돌려준다. 취소·무효화된 응답은 null(조용히 끝).
   */
  async refresh(): Promise<SectionFailure | null> {
    const wasReady = this.getSnapshot().status === 'ready';
    this.invalidate();
    this.refreshing = true;
    const token = this.generation;
    if (wasReady) this.dropLoadingMore();
    try {
      const page = await this.deps.repository.list(1, this.controller.signal);
      if (token !== this.generation) return null;
      this.nextPage = 2;
      this.setState({
        status: 'ready',
        banners: page.banners,
        hasNext: page.hasNext && page.banners.length > 0,
        loadingMore: false,
      });
      return null;
    } catch (error) {
      if (token !== this.generation || error instanceof CancelledError) return null;
      // 목록이 없던 상태(최초 조회 중이거나 실패)는 오류 + 다시 시도로 남긴다.
      if (!wasReady) this.setState({ status: 'error' });
      return { network: error instanceof NetworkError };
    } finally {
      if (token === this.generation) this.refreshing = false;
    }
  }

  /**
   * 화면에 보이는 마지막 카드의 인덱스가 바뀔 때 부른다. 마지막에서 두 번째 이내(index >= length - 2)이고
   * hasNext이며 다른 로딩이 없을 때만 다음 페이지를 요청한다. 실패하면 목록을 유지하고 같은 페이지 번호로 다시 시도할 수 있다.
   * 같은 id는 한 번만 누적한다. 새로고침 이전에 보낸 요청의 늦은 응답은 버린다.
   */
  async onLastVisibleIndexChanged(index: number): Promise<void> {
    const state = this.getSnapshot();
    if (state.status !== 'ready' || !state.hasNext || state.loadingMore || this.refreshing) return;
    if (index < state.banners.length - PREFETCH_DISTANCE) return;
    const token = this.generation;
    this.setState({ ...state, loadingMore: true });
    try {
      const page = await this.deps.repository.list(this.nextPage, this.controller.signal);
      if (token !== this.generation) return;
      const current = this.getSnapshot();
      if (current.status !== 'ready') return;
      const known = new Set(current.banners.map((b) => b.id));
      const added = page.banners.filter((b) => !known.has(b.id));
      this.nextPage += 1;
      this.setState({
        status: 'ready',
        banners: [...current.banners, ...added],
        // 빈 추가 페이지는 끝으로 본다(서버가 hasNext를 잘못 줘도 무한 요청을 막는다).
        hasNext: page.hasNext && page.banners.length > 0,
        loadingMore: false,
      });
    } catch {
      if (token !== this.generation) return;
      this.dropLoadingMore();
    }
  }

  /** 진행 중 요청을 모두 취소하고 이후 도착한 응답을 버린다. 취소는 상태를 바꾸지 않는다(TC-BANR-008). */
  cancelPending(): void {
    this.invalidate();
    this.dropLoadingMore();
  }

  /** 로그아웃·계정 전환 시 초기(loading) 상태로 되돌린다. */
  reset(): void {
    this.invalidate();
    this.nextPage = 2;
    this.setState({ status: 'loading' });
  }

  /** 진행 중 요청을 취소하고 그 응답을 낡은 것으로 만든다. */
  private invalidate(): void {
    this.generation += 1;
    this.controller.abort();
    this.controller = new AbortController();
    this.loadInFlight = null;
    this.refreshing = false;
  }

  private dropLoadingMore(): void {
    this.setState((s) =>
      s.status === 'ready' && s.loadingMore ? { ...s, loadingMore: false } : s,
    );
  }
}

/** 마지막으로 보이는 카드가 마지막에서 이 거리 이내면 다음 페이지를 요청한다(AN ISSUE_PREFETCH_DISTANCE). */
const PREFETCH_DISTANCE = 2;
