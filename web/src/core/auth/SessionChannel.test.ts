import { SESSION_CHANNEL_NAME, createSessionChannel } from './SessionChannel';
import type { BroadcastChannelLike, SessionSignal } from './SessionChannel';
import { ME, OTHER_USER } from '../../test/fixtures';

/** 이름이 같은 객체끼리 메시지를 주고받는 가짜 BroadcastChannel(자기 자신에게는 안 간다). 실제로 기다리지 않는다. */
class FakeBroadcastChannel implements BroadcastChannelLike {
  static instances: FakeBroadcastChannel[] = [];
  closed = false;
  readonly sent: unknown[] = [];
  private readonly listeners = new Set<(event: { data: unknown }) => void>();

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(data: unknown): void {
    if (this.closed) throw new DOMException('closed', 'InvalidStateError');
    this.sent.push(data);
    for (const other of FakeBroadcastChannel.instances) if (other !== this && other.name === this.name && !other.closed) other.emit(data);
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }
  close(): void {
    this.closed = true;
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  emit(data: unknown): void {
    [...this.listeners].forEach((l) => l({ data }));
  }
}

beforeEach(() => {
  FakeBroadcastChannel.instances = [];
});

const host = { BroadcastChannel: FakeBroadcastChannel };
const switched: SessionSignal = { previousUserId: ME, userId: OTHER_USER };

describe('createSessionChannel (BroadcastChannel)', () => {
  it('채널 이름은 chalkak-session이다', () => {
    expect(SESSION_CHANNEL_NAME).toBe('chalkak-session');
    createSessionChannel(host);
    expect(FakeBroadcastChannel.instances.map((c) => c.name)).toEqual(['chalkak-session']);
  });

  it('REQ-NAV-022 post한 신호는 다른 탭의 구독자에게만 간다(자기 자신에게는 오지 않는다)', () => {
    const tabA = createSessionChannel(host);
    const tabB = createSessionChannel(host);
    const seenA: SessionSignal[] = [];
    const seenB: SessionSignal[] = [];
    tabA.subscribe((s) => seenA.push(s));
    tabB.subscribe((s) => seenB.push(s));
    tabA.post(switched);
    expect(seenA).toEqual([]);
    expect(seenB).toEqual([switched]);
  });

  it('신호는 userId(와 이전 userId)만 담고 일반 객체로 보낸다. 토큰 필드가 없다', () => {
    createSessionChannel(host).post({ previousUserId: ME, userId: null });
    expect(FakeBroadcastChannel.instances[0]!.sent).toEqual([{ previousUserId: ME, userId: null }]);
  });

  it('모양이 틀린 메시지(문자열, null, 필드 누락, 잘못된 타입)는 무시한다', () => {
    const channel = createSessionChannel(host);
    const seen: SessionSignal[] = [];
    channel.subscribe((s) => seen.push(s));
    const raw = FakeBroadcastChannel.instances[0]!;
    for (const bad of ['logout', null, undefined, 42, [], {}, { userId: ME }, { previousUserId: ME }, { previousUserId: 1, userId: null }, { previousUserId: ME, userId: {} }]) raw.emit(bad);
    expect(seen).toEqual([]);
    raw.emit({ previousUserId: null, userId: ME });
    expect(seen).toEqual([{ previousUserId: null, userId: ME }]);
  });

  it('구독 해제 함수를 부르면 더 받지 않는다', () => {
    const channel = createSessionChannel(host);
    const seen: SessionSignal[] = [];
    const off = channel.subscribe((s) => seen.push(s));
    const raw = FakeBroadcastChannel.instances[0]!;
    raw.emit(switched);
    off();
    raw.emit(switched);
    expect(seen).toHaveLength(1);
    expect(raw.listenerCount).toBe(0);
  });

  it('구독자 하나가 던져도 나머지는 신호를 받는다', () => {
    const channel = createSessionChannel(host);
    const seen: SessionSignal[] = [];
    channel.subscribe(() => {
      throw new Error('boom');
    });
    channel.subscribe((s) => seen.push(s));
    expect(() => FakeBroadcastChannel.instances[0]!.emit(switched)).not.toThrow();
    expect(seen).toEqual([switched]);
  });

  it('close하면 BroadcastChannel을 닫고, 닫은 뒤 post는 던지지 않는다', () => {
    const channel = createSessionChannel(host);
    channel.close();
    expect(FakeBroadcastChannel.instances[0]!.closed).toBe(true);
    expect(() => channel.post(switched)).not.toThrow();
  });

  it('post가 던져도(직렬화 실패 등) 호출자에게 전파하지 않는다', () => {
    const channel = createSessionChannel(host);
    vi.spyOn(FakeBroadcastChannel.instances[0]!, 'postMessage').mockImplementation(() => {
      throw new Error('DataCloneError');
    });
    expect(() => channel.post(switched)).not.toThrow();
  });

  it('BroadcastChannel이 없는 환경이면 아무것도 안 하는 채널이다(던지지 않음)', () => {
    const channel = createSessionChannel({});
    const seen: SessionSignal[] = [];
    expect(() => channel.subscribe((s) => seen.push(s))()).not.toThrow();
    expect(() => channel.post(switched)).not.toThrow();
    expect(() => channel.close()).not.toThrow();
    expect(seen).toEqual([]);
  });

  it('BroadcastChannel 생성이 던지면(보안 제한 등) 아무것도 안 하는 채널로 대신한다', () => {
    class Throwing {
      constructor() {
        throw new DOMException('denied', 'SecurityError');
      }
    }
    const channel = createSessionChannel({ BroadcastChannel: Throwing as unknown as new (name: string) => BroadcastChannelLike });
    expect(() => channel.post(switched)).not.toThrow();
    expect(() => channel.subscribe(() => undefined)()).not.toThrow();
  });
});
