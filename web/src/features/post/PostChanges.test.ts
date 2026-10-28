import type { PostChange } from './postModels';
import { PostChanges } from './PostChanges';

const A = '22222222-2222-4222-8222-222222222201';
const B = '22222222-2222-4222-8222-222222222202';

describe('PostChanges (화면 사이 게시물 변경 이벤트)', () => {
  it('TC-LIKE-025 구독자 모두에게 같은 순서로 알리고, 해제하면 더 받지 않는다', () => {
    const changes = new PostChanges();
    const first: PostChange[] = [];
    const second: PostChange[] = [];
    const off = changes.subscribe((c) => first.push(c));
    changes.subscribe((c) => second.push(c));
    changes.publish({ type: 'like', postId: A, isLiked: true, likeCount: 11 });
    changes.publish({ type: 'title', postId: A, title: '새 제목' });
    off();
    changes.publish({ type: 'like', postId: A, isLiked: false, likeCount: 10 });
    expect(first).toEqual([
      { type: 'like', postId: A, isLiked: true, likeCount: 11 },
      { type: 'title', postId: A, title: '새 제목' },
    ]);
    expect(second).toHaveLength(3);
  });

  it('TC-FEED-044 removed를 기억해 두고 withoutRemoved가 삭제된 게시물을 응답에서 거른다', () => {
    const changes = new PostChanges();
    expect(changes.wasRemoved(A)).toBe(false);
    changes.publish({ type: 'removed', postId: A });
    expect(changes.wasRemoved(A)).toBe(true);
    expect(changes.wasRemoved(B)).toBe(false);
    expect(changes.withoutRemoved([{ id: A }, { id: B }])).toEqual([{ id: B }]);
  });

  it('like·title 이벤트는 삭제 기억에 영향을 주지 않는다', () => {
    const changes = new PostChanges();
    changes.publish({ type: 'like', postId: A, isLiked: true, likeCount: 1 });
    changes.publish({ type: 'title', postId: A, title: null });
    expect(changes.wasRemoved(A)).toBe(false);
  });

  it('TC-FEED-057 reset은 삭제 기억을 비우지만 구독은 유지한다(계정 전환)', () => {
    const changes = new PostChanges();
    const seen: PostChange[] = [];
    changes.subscribe((c) => seen.push(c));
    changes.publish({ type: 'removed', postId: A });
    changes.reset();
    expect(changes.wasRemoved(A)).toBe(false);
    changes.publish({ type: 'like', postId: B, isLiked: true, likeCount: 2 });
    expect(seen).toHaveLength(2);
  });

  it('구독자 하나가 던져도 나머지에게는 알린다', () => {
    const changes = new PostChanges();
    const seen: PostChange[] = [];
    changes.subscribe(() => {
      throw new Error('listener failed');
    });
    changes.subscribe((c) => seen.push(c));
    expect(() => changes.publish({ type: 'removed', postId: A })).not.toThrow();
    expect(seen).toHaveLength(1);
  });
});
