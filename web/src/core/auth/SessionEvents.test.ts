import { SessionEvents } from './SessionEvents';

describe('SessionEvents', () => {
  it('구독자에게 사유와 함께 알리고, 해제하면 더 받지 않는다', () => {
    const events = new SessionEvents();
    const seen: string[] = [];
    const off = events.subscribe((reason) => seen.push(reason));
    events.emit('expired');
    events.emit('logout');
    off();
    events.emit('withdrawn');
    expect(seen).toEqual(['expired', 'logout']);
  });

  it('구독자가 없을 때 emit해도 던지지 않는다', () => {
    expect(() => new SessionEvents().emit('expired')).not.toThrow();
  });

  it('구독자 하나가 던져도 나머지는 알림을 받는다', () => {
    const events = new SessionEvents();
    const seen: string[] = [];
    events.subscribe(() => {
      throw new Error('boom');
    });
    events.subscribe((reason) => seen.push(reason));
    events.emit('expired');
    expect(seen).toEqual(['expired']);
  });
});
