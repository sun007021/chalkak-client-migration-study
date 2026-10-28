import { PostChanges } from './PostChanges';
import type { PostChange } from './postModels';

const A = '22222222-2222-4222-8222-222222222201';

describe('PostChanges created (업로드 성공 알림)', () => {
  it('TC-UPL-060 created를 구독자 모두에게 알리고 removed로 기억하지 않는다', () => {
    const changes = new PostChanges();
    const first: PostChange[] = [];
    const second: PostChange[] = [];
    changes.subscribe((c) => first.push(c));
    changes.subscribe((c) => second.push(c));
    const created: PostChange = { type: 'created', postId: A, topicDate: '2026-10-27', moderationStatus: 'PENDING' };
    changes.publish(created);
    expect(first).toEqual([created]);
    expect(second).toEqual([created]);
    expect(changes.wasRemoved(A)).toBe(false);
  });

  it('TC-UPL-060 created 이후 같은 게시물이 삭제되면 removed를 기억한다', () => {
    const changes = new PostChanges();
    changes.publish({ type: 'created', postId: A, topicDate: '2026-10-27', moderationStatus: 'VALIDATING' });
    changes.publish({ type: 'removed', postId: A });
    expect(changes.wasRemoved(A)).toBe(true);
  });

  it('TC-UPL-060 created가 있어도 withoutRemoved는 목록을 그대로 둔다', () => {
    const changes = new PostChanges();
    changes.publish({ type: 'created', postId: A, topicDate: '2026-10-27', moderationStatus: 'PENDING' });
    const posts = [{ id: A }];
    expect(changes.withoutRemoved(posts)).toEqual(posts);
  });
});
