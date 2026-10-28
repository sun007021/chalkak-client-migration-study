import { ViewModel } from '../../core/state/ViewModel';
import type { Banner } from './homeModels';
import type { BannerRepository } from './BannerRepository';

export type BannerFeedState =
  | { status: 'loading' }
  | { status: 'error' }
  /** banners가 비면 ISSUE 섹션을 숨긴다(REQ-BANR-005). nextPage는 다음에 요청할 페이지 번호. */
  | { status: 'ready'; banners: Banner[]; hasNext: boolean; loadingMore: boolean; nextPage: number };

/** 새로고침 실패 결과. 취소·성공이면 null. */
export type BannerRefreshFailure = { network: boolean } | null;

/** 홈 ISSUE 섹션의 목록·페이징(REQ-BANR-007~011). 홈 ViewModel이 load/refresh를 부른다. */
export class BannerFeed extends ViewModel<BannerFeedState> {
  constructor(protected readonly deps: { repository: BannerRepository }) {
    super({ status: 'loading' });
  }

  /** 1페이지를 불러온다. 실패하면 error(재호출하면 loading을 거쳐 다시). 같은 id는 한 번만. */
  load(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 새 1페이지로 교체(빈 성공이면 비움). 실패하면 기존 목록 유지하고 실패 종류를 돌려준다. 취소면 null. 늦게 온 추가 페이지 응답은 버린다. */
  refresh(): Promise<BannerRefreshFailure> {
    throw new Error('not implemented');
  }

  /** 목록에서 마지막으로 보이는 카드의 인덱스. total-2 이내이고 hasNext이며 로딩 중이 아니면 nextPage를 요청한다. 실패하면 같은 페이지로 재시도 가능. 빈 추가 페이지는 hasNext=false. */
  onLastVisibleIndexChanged(_index: number): Promise<void> {
    throw new Error('not implemented');
  }

  /** 진행 중인 요청을 무효화(화면 이탈). 도착한 응답은 상태를 바꾸지 않는다. */
  cancelPending(): void {
    throw new Error('not implemented');
  }

  /** loading으로 되돌린다(계정 전환·새 홈 진입). */
  reset(): void {
    throw new Error('not implemented');
  }
}
