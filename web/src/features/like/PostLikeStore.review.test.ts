import { PostChanges } from '../post/PostChanges';
import { ToastController } from '../../core/ui/ToastController';
import { FakeClock } from '../../test/FakeClock';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { PostLikeStore } from './PostLikeStore';
import type { LikeRepository } from './LikeRepository';

describe('PostLikeStore.reset 취소 (코드리뷰 9, TC-LIKE-031)', () => {
  function setup() {
    const signals: AbortSignal[] = [];
    const repository = {
      like: (_id: string, signal?: AbortSignal) => {
        signals.push(signal!);
        return new Promise<never>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      },
      unlike: () => Promise.reject(new Error('unused')),
    } as unknown as LikeRepository;
    const toast = new ToastController({ clock: new FakeClock(0), ids: new SequentialIdGenerator() });
    const changes = new PostChanges();
    const events: string[] = [];
    changes.subscribe((c) => events.push(c.type));
    return { store: new PostLikeStore({ repository, changes, toast }), signals, events, toast };
  }

  it('요청에 취소 신호를 넘기고 reset()이 아직 끝나지 않은 요청을 취소한다. 취소는 롤백 이벤트·토스트를 만들지 않는다', async () => {
    const { store, signals, events, toast } = setup();
    const done = store.toggle({ id: 'p1', isLiked: false, likeCount: 1 });
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(false);
    const before = events.length;
    store.reset();
    expect(signals[0]!.aborted).toBe(true);
    await done;
    expect(events).toHaveLength(before);
    expect(toast.state.toast).toBeNull();
    expect(store.current('p1')).toBeUndefined();
  });

  it('reset 뒤의 새 요청은 새 신호를 쓰므로 취소되지 않는다', async () => {
    const { store, signals } = setup();
    void store.toggle({ id: 'p1', isLiked: false, likeCount: 1 });
    store.reset();
    void store.toggle({ id: 'p2', isLiked: false, likeCount: 1 });
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });
});
