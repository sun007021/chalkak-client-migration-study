import type { PostChange, PostItem } from '../post/postModels';

/** (날짜, 요청 정렬) 하나의 캐시: 페이지별 목록과 다음 페이지를 이어 받는 데 필요한 값. */
export interface Listing {
  topicTitle: string;
  /** 서버가 준 페이지 단위. 첫 페이지 재검증은 pages[0]만 바꾸고 뒤쪽은 유지한다. */
  pages: PostItem[][];
  /** pages를 이어 붙여 id 중복을 제거한 목록. */
  posts: PostItem[];
  hasNext: boolean;
  /** 랜덤 첫 페이지 응답의 시드(랜덤이 아니거나 서버가 주지 않았으면 null). */
  seed: string | null;
}

/** pages를 이어 붙여 id(대소문자 무시) 중복을 제거한다. 먼저 나온 항목이 남는다. */
export function flattenPages(pages: readonly PostItem[][]): PostItem[] {
  const seen = new Set<string>();
  const out: PostItem[] = [];
  for (const page of pages) {
    for (const post of page) {
      const id = post.id.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(post);
    }
  }
  return out;
}

const withPages = (listing: Listing, pages: PostItem[][], patch: Partial<Pick<Listing, 'hasNext' | 'seed'>> = {}): Listing => ({ ...listing, ...patch, pages, posts: flattenPages(pages) });

/**
 * 페이지 단위 목록 캐시(순수 데이터 구조, 네트워크·시계·좋아요 저장소를 모른다). 전시가 (날짜, 정렬) 키로 쓰고 기록 탭 같은 페이지 목록도 같은 모양으로 쓸 수 있다.
 * 모든 변경은 새 Listing 객체로 바꿔 끼운다(화면에 나간 posts 배열을 제자리에서 고치지 않는다).
 */
export class DisplayListingCache {
  private readonly listings = new Map<string, Listing>();

  get(key: string): Listing | undefined {
    return this.listings.get(key);
  }

  delete(key: string): void {
    this.listings.delete(key);
  }

  clear(): void {
    this.listings.clear();
  }

  /** 첫 페이지로 새 목록을 만든다(같은 키가 있으면 대체). */
  start(key: string, init: { topicTitle: string; first: PostItem[]; hasNext: boolean; seed: string | null }): Listing {
    const listing: Listing = { topicTitle: init.topicTitle, pages: [init.first], posts: flattenPages([init.first]), hasNext: init.hasNext, seed: init.seed };
    this.listings.set(key, listing);
    return listing;
  }

  /**
   * 다음 페이지를 이어 붙인다. 그 사이 목록이 바뀌었으면(이미 page-1장이 아니거나 시드가 다르면) 버린다. posts가 null이면 범위 밖 빈 응답이라 hasNext만 끈다.
   * 적용했으면 true.
   */
  append(key: string, args: { page: number; seed: string | null; posts: PostItem[] | null; hasNext: boolean }): boolean {
    const current = this.listings.get(key);
    if (!current || current.pages.length !== args.page - 1 || current.seed !== args.seed) return false;
    this.listings.set(key, args.posts ? withPages(current, [...current.pages, args.posts], { hasNext: args.hasNext }) : withPages(current, current.pages, { hasNext: false }));
    return true;
  }

  /**
   * 재검증한 첫 페이지로 pages[0]만 바꾼다. keepsTail이면 뒤쪽 페이지를 유지하고(뒤쪽이 있으면 hasNext도 유지), 아니면(랜덤 시드가 바뀜) 첫 페이지만 남기고 새 시드·hasNext를 쓴다.
   */
  replaceFirst(key: string, args: { first: PostItem[]; keepsTail: boolean; hasNext: boolean; seed: string | null }): void {
    const current = this.listings.get(key);
    if (!current) return;
    this.listings.set(
      key,
      args.keepsTail
        ? withPages(current, [args.first, ...current.pages.slice(1)], { hasNext: current.pages.length > 1 ? current.hasNext : args.hasNext })
        : withPages(current, [args.first], { hasNext: args.hasNext, seed: args.seed }),
    );
  }

  /** 좋아요·제목·삭제 이벤트를 모든 목록에 반영한다(그 게시물이 있는 목록만 바꾼다). */
  applyChange(change: PostChange): void {
    const same = (post: PostItem): boolean => post.id.toLowerCase() === change.postId.toLowerCase();
    for (const [key, listing] of this.listings) {
      if (!listing.pages.some((page) => page.some(same))) continue;
      let pages: PostItem[][];
      if (change.type === 'like') pages = listing.pages.map((page) => page.map((post) => (same(post) ? { ...post, isLiked: change.isLiked, likeCount: change.likeCount } : post)));
      else if (change.type === 'title') pages = listing.pages.map((page) => page.map((post) => (same(post) ? { ...post, title: change.title } : post)));
      else if (change.type === 'removed') pages = listing.pages.map((page) => page.filter((post) => !same(post)));
      else continue;
      this.listings.set(key, withPages(listing, pages));
    }
  }
}
