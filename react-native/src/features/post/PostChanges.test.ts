import { DefaultPostChanges, type PostChange } from './PostChanges';

describe('DefaultPostChanges', () => {
  it('TC-FEED-024 TC-FEED-036 변경을 모든 구독자(전시·기록·홈)에게 알리고 구독 해제를 존중한다', () => {
    const changes = new DefaultPostChanges();
    const a: PostChange[] = [];
    const b: PostChange[] = [];
    changes.subscribe((c) => a.push(c));
    const stop = changes.subscribe((c) => b.push(c));
    changes.publish({ kind: 'title-changed', postId: 'p1', title: '새 제목' });
    stop();
    changes.publish({ kind: 'deleted', postId: 'p1' });
    expect(a).toHaveLength(2);
    expect(b).toEqual([{ kind: 'title-changed', postId: 'p1', title: '새 제목' }]);
  });

  it('TC-FEED-044 삭제한 postId는 기억되어 늦은 응답이 되살리지 못하게 걸러 낼 수 있다', () => {
    const changes = new DefaultPostChanges();
    changes.publish({ kind: 'deleted', postId: 'p1' });
    changes.publish({ kind: 'title-changed', postId: 'p2', title: null });
    expect(changes.isDeleted('p1')).toBe(true);
    expect(changes.isDeleted('p2')).toBe(false);
  });

  it('TC-FEED-057 계정 전환(clearAll) 뒤에는 삭제 기억이 남지 않는다', () => {
    const changes = new DefaultPostChanges();
    changes.publish({ kind: 'deleted', postId: 'p1' });
    changes.clearAll();
    expect(changes.isDeleted('p1')).toBe(false);
  });
});
