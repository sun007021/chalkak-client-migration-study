import type { SessionChannel, SessionSignal } from '../core/auth/SessionChannel';

/** 탭 여러 개를 흉내 내는 허브. open()마다 "탭 하나의 채널 객체"를 주고, post는 같은 허브의 다른 채널에만 동기로 전달한다(BroadcastChannel처럼 자기 자신에게는 안 간다). */
export class SessionChannelHub {
  private readonly channels = new Set<FakeSessionChannel>();

  open(): FakeSessionChannel {
    const channel = new FakeSessionChannel(this);
    this.channels.add(channel);
    return channel;
  }

  deliver(from: FakeSessionChannel, signal: SessionSignal): void {
    for (const channel of [...this.channels]) if (channel !== from) channel.receive(signal);
  }

  remove(channel: FakeSessionChannel): void {
    this.channels.delete(channel);
  }
}

export class FakeSessionChannel implements SessionChannel {
  readonly posted: SessionSignal[] = [];
  closed = false;
  private readonly listeners = new Set<(signal: SessionSignal) => void>();

  constructor(private readonly hub: SessionChannelHub | null = null) {}

  get listenerCount(): number {
    return this.listeners.size;
  }

  post(signal: SessionSignal): void {
    this.posted.push(structuredClone(signal));
    this.hub?.deliver(this, signal);
  }

  subscribe(listener: (signal: SessionSignal) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.hub?.remove(this);
  }

  /** 테스트가 다른 탭의 신호를 직접 흘려 넣는다. */
  receive(signal: SessionSignal): void {
    for (const listener of [...this.listeners]) listener(structuredClone(signal));
  }
}
