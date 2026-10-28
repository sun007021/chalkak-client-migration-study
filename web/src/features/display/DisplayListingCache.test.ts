import type { PostItem } from '../post/postModels';
import { DisplayListingCache, flattenPages } from './DisplayListingCache';

const post = (n: number, over: Partial<PostItem> = {}): PostItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  authorId: 'a',
  originalImageUrl: 'https://cdn.example.test/o.webp',
  thumbnailImageUrl: null,
  signatureOriginalImageUrl: null,
  signatureThumbnailImageUrl: null,
  title: `t${n}`,
  likeCount: n,
  isLiked: false,
  isMine: false,
  ...over,
});
const ids = (posts: PostItem[]) => posts.map((p) => Number(p.id.slice(-3)));

describe('DisplayListingCache (코드리뷰 7)', () => {
  it('flattenPages는 id(대소문자 무시) 중복을 먼저 나온 항목만 남긴다', () => {
    const upper = post(2, { title: 'dup' });
    upper.id = upper.id.toUpperCase();
    expect(ids(flattenPages([[post(1), post(2)], [upper, post(3)]]))).toEqual([1, 2, 3]);
    expect(flattenPages([[post(1), post(2)], [upper]])[1]!.title).toBe('t2');
  });

  it('start 뒤 append는 page-1장일 때만 이어 붙이고 시드가 다르면 버린다', () => {
    const cache = new DisplayListingCache();
    cache.start('k', { topicTitle: 'T', first: [post(1)], hasNext: true, seed: 's' });
    expect(cache.append('k', { page: 3, seed: 's', posts: [post(9)], hasNext: false })).toBe(false);
    expect(cache.append('k', { page: 2, seed: 'other', posts: [post(9)], hasNext: false })).toBe(false);
    expect(cache.append('k', { page: 2, seed: 's', posts: [post(2), post(1)], hasNext: false })).toBe(true);
    expect(ids(cache.get('k')!.posts)).toEqual([1, 2]);
    expect(cache.get('k')).toMatchObject({ hasNext: false });
    expect(cache.append('missing', { page: 2, seed: null, posts: [], hasNext: false })).toBe(false);
  });

  it('범위 밖 빈 응답(posts=null)은 목록을 그대로 두고 hasNext만 끈다', () => {
    const cache = new DisplayListingCache();
    cache.start('k', { topicTitle: 'T', first: [post(1)], hasNext: true, seed: null });
    cache.append('k', { page: 2, seed: null, posts: null, hasNext: true });
    expect(cache.get('k')).toMatchObject({ hasNext: false });
    expect(ids(cache.get('k')!.posts)).toEqual([1]);
  });

  it('replaceFirst는 첫 페이지만 바꾸고 뒤쪽·hasNext를 유지한다(시드가 바뀌면 뒤쪽을 버린다)', () => {
    const cache = new DisplayListingCache();
    cache.start('k', { topicTitle: 'T', first: [post(1)], hasNext: true, seed: 's' });
    cache.append('k', { page: 2, seed: 's', posts: [post(2)], hasNext: false });
    cache.replaceFirst('k', { first: [post(5)], keepsTail: true, hasNext: true, seed: 's' });
    expect(ids(cache.get('k')!.posts)).toEqual([5, 2]);
    expect(cache.get('k')!.hasNext).toBe(false);
    cache.replaceFirst('k', { first: [post(7)], keepsTail: false, hasNext: true, seed: 'new' });
    expect(ids(cache.get('k')!.posts)).toEqual([7]);
    expect(cache.get('k')).toMatchObject({ hasNext: true, seed: 'new' });
  });

  it('applyChange는 like·title을 갱신하고 removed는 모든 목록에서 뺀다. 없는 게시물의 목록 객체는 그대로다', () => {
    const cache = new DisplayListingCache();
    cache.start('a', { topicTitle: 'A', first: [post(1), post(2)], hasNext: false, seed: null });
    cache.start('b', { topicTitle: 'B', first: [post(3)], hasNext: false, seed: null });
    const untouched = cache.get('b');
    const before = cache.get('a')!.posts;
    const id = post(2).id;
    cache.applyChange({ type: 'like', postId: id.toUpperCase(), isLiked: true, likeCount: 99 });
    expect(cache.get('a')!.posts[1]).toMatchObject({ isLiked: true, likeCount: 99 });
    expect(cache.get('a')!.posts).not.toBe(before);
    cache.applyChange({ type: 'title', postId: id, title: null });
    expect(cache.get('a')!.posts[1]!.title).toBeNull();
    cache.applyChange({ type: 'removed', postId: id });
    expect(ids(cache.get('a')!.posts)).toEqual([1]);
    expect(cache.get('b')).toBe(untouched);
  });

  it('delete·clear', () => {
    const cache = new DisplayListingCache();
    cache.start('a', { topicTitle: 'A', first: [], hasNext: false, seed: null });
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    cache.start('a', { topicTitle: 'A', first: [], hasNext: false, seed: null });
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
  });
});
