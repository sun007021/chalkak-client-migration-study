import { ViewModel } from '../../core/state/ViewModel';
import { NetworkError } from '../../core/net/errors';
import type { Banner } from './homeModels';
import type { BannerRepository } from './BannerRepository';

export type BannerFeedState =
  | { status: 'loading' }
  | { status: 'error' }
  /** banners가 비면 ISSUE 섹션을 숨긴다(REQ-BANR-005). nextPage는 다음에 요청할 페이지 번호. */
  | { status: 'ready'; banners: Banner[]; hasNext: boolean; loadingMore: boolean; nextPage: number };

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

/** 홈 ISSUE 섹션의 목록·페이징(REQ-BANR-007~011). 홈 ViewModel이 load/refresh를 부른다. */
export class BannerFeed extends ViewModel<BannerFeedState> {
  /** 요청 묶음 번호. 새 1페이지 요청·취소·초기화가 올리면 이전 요청의 응답은 버려진다. */
  private epoch = 0;
  private controller: AbortController | null = null;

  constructor(protected readonly deps: { repository: BannerRepository }) {
    super({ status: 'loading' });
  }

  /** 이전 요청을 모두 무효화하고 새 요청용 신호를 돌려준다. */
  private begin(): { signal: AbortSignal; isCurrent: () => boolean } {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const mine = ++this.epoch;
    return { signal: controller.signal, isCurrent: () => this.epoch === mine };
  }

  /** 1페이지를 불러온다. 실패하면 error(재호출하면 loading을 거쳐 다시). 같은 id는 한 번만. */
  async load(): Promise<void> {
    const request = this.begin();
    this.replaceState({ status: 'loading' });
    try {
      const page = await this.deps.repository.list(1, request.signal);
      if (!request.isCurrent()) return;
      this.replaceState({ status: 'ready', banners: mergeUnique([], page.banners), hasNext: page.hasNext, loadingMore: false, nextPage: 2 });
    } catch (error) {
      if (!request.isCurrent() || isAbort(error)) return;
      this.replaceState({ status: 'error' });
    }
  }

  /** 새 1페이지로 교체(빈 성공이면 비움). 실패하면 기존 목록 유지하고 실패 종류를 돌려준다. 취소면 null. 늦게 온 추가 페이지 응답은 버린다. */
  async refresh(): Promise<BannerRefreshFailure> {
    const request = this.begin();
    const before = this.state;
    if (before.status === 'ready' && before.loadingMore) this.setState({ loadingMore: false });
    try {
      const page = await this.deps.repository.list(1, request.signal);
      if (!request.isCurrent()) return null;
      this.replaceState({ status: 'ready', banners: mergeUnique([], page.banners), hasNext: page.hasNext, loadingMore: false, nextPage: 2 });
      return null;
    } catch (error) {
      if (!request.isCurrent() || isAbort(error)) return null;
      if (this.state.status === 'loading') this.replaceState({ status: 'error' });
      return { network: error instanceof NetworkError };
    }
  }

  /** 목록에서 마지막으로 보이는 카드의 인덱스. total-2 이내이고 hasNext이며 로딩 중이 아니면 nextPage를 요청한다. 실패하면 같은 페이지로 재시도 가능. 빈 추가 페이지는 hasNext=false. */
  async onLastVisibleIndexChanged(index: number): Promise<void> {
    const current = this.state;
    if (current.status !== 'ready' || !current.hasNext || current.loadingMore) return;
    if (index < current.banners.length - 2) return;
    const request = this.begin();
    this.setState({ loadingMore: true } as Partial<BannerFeedState>);
    try {
      const page = await this.deps.repository.list(current.nextPage, request.signal);
      if (!request.isCurrent()) return;
      const latest = this.state;
      if (latest.status !== 'ready') return;
      this.setState({
        banners: mergeUnique(latest.banners, page.banners),
        hasNext: page.banners.length > 0 && page.hasNext,
        nextPage: latest.nextPage + 1,
        loadingMore: false,
      } as Partial<BannerFeedState>);
    } catch (error) {
      if (!request.isCurrent() || isAbort(error)) return;
      this.setState({ loadingMore: false } as Partial<BannerFeedState>);
    }
  }

  /** 진행 중인 요청을 무효화(화면 이탈). 도착한 응답은 상태를 바꾸지 않는다. */
  cancelPending(): void {
    this.controller?.abort();
    this.controller = null;
    this.epoch += 1;
    if (this.state.status === 'ready' && this.state.loadingMore) this.setState({ loadingMore: false } as Partial<BannerFeedState>);
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
