import { KstDate } from '../../core/time/KstDate';
import { DefaultPostCreationNotifier } from './DefaultPostCreationNotifier';

const EVENT = {
  postId: 'p1',
  topicDate: KstDate.of(2026, 10, 27),
  moderationStatus: 'PENDING',
} as const;

describe('DefaultPostCreationNotifier', () => {
  it('REQ-UPL-063 구독자에게 만들어진 게시물을 알리고, 구독을 풀면 더는 알리지 않는다', () => {
    const notifier = new DefaultPostCreationNotifier();
    const listener = jest.fn();
    const stop = notifier.subscribe(listener);
    notifier.postCreated(EVENT);
    stop();
    notifier.postCreated(EVENT);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(EVENT);
  });

  it('한 구독자가 던져도 나머지에게 알린다', () => {
    const notifier = new DefaultPostCreationNotifier();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const after = jest.fn();
    notifier.subscribe(() => {
      throw new Error('boom');
    });
    notifier.subscribe(after);
    notifier.postCreated(EVENT);
    expect(after).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
