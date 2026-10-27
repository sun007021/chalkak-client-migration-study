import { AuthSessionEvents } from './AuthSessionEvents';

describe('AuthSessionEvents', () => {
  it('구독자 모두에게 이벤트를 전달한다', () => {
    const events = new AuthSessionEvents();
    const a = jest.fn();
    const b = jest.fn();
    events.subscribe(a);
    events.subscribe(b);
    events.emit({ type: 'session-expired' });
    expect(a).toHaveBeenCalledWith({ type: 'session-expired' });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('구독 해제 뒤에는 받지 않는다', () => {
    const events = new AuthSessionEvents();
    const listener = jest.fn();
    const unsubscribe = events.subscribe(listener);
    unsubscribe();
    events.emit({ type: 'session-expired' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('한 구독자가 던져도 다른 구독자에게 전달된다', () => {
    const events = new AuthSessionEvents();
    const survivor = jest.fn();
    events.subscribe(() => {
      throw new Error('boom');
    });
    events.subscribe(survivor);
    expect(() => events.emit({ type: 'session-expired' })).not.toThrow();
    expect(survivor).toHaveBeenCalledTimes(1);
  });
});
