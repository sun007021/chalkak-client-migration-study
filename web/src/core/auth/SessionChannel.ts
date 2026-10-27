export const SESSION_CHANNEL_NAME = 'chalkak-session';

/**
 * 다른 탭에 알리는 신호. 계정이 바뀐 쓰기·삭제 때만 보낸다(같은 계정의 토큰 갱신, 게스트 플래그, 빈 저장소 지우기는 보내지 않는다).
 * userId만 담고 토큰은 절대 담지 않는다. 전송할 때 채널이 탭 고유 origin을 붙이고 받을 때 자기 origin이면 버린다(신호 인터페이스에는 나오지 않는다).
 */
export interface SessionSignal {
  previousUserId: string | null;
  /** null이면 지워졌다(로그아웃·탈퇴·재인증 필요). */
  userId: string | null;
}

export interface SessionChannel {
  /** 다른 탭들에게만 전달된다(자기 자신에게는 오지 않는다). 실패해도 던지지 않는다. */
  post(signal: SessionSignal): void;
  /** 다른 탭의 신호를 받는다. 모양이 틀린 메시지는 무시한다. 해제 함수를 돌려준다. */
  subscribe(listener: (signal: SessionSignal) => void): () => void;
  close(): void;
}

/** BroadcastChannel의 필요한 부분만. 테스트는 Fake를 넣는다. */
export interface BroadcastChannelLike {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export interface BroadcastChannelHost {
  BroadcastChannel?: new (name: string) => BroadcastChannelLike;
}

/** BroadcastChannel(SESSION_CHANNEL_NAME)로 만든다. 지원하지 않거나 생성이 던지면 아무것도 안 하는 채널을 돌려준다. */
export function createSessionChannel(host: BroadcastChannelHost = globalThis as BroadcastChannelHost, origin: string = newOrigin()): SessionChannel {
  const Ctor = host.BroadcastChannel;
  if (typeof Ctor !== 'function') return NOOP_CHANNEL;
  let raw: BroadcastChannelLike;
  try {
    raw = new Ctor(SESSION_CHANNEL_NAME);
  } catch {
    return NOOP_CHANNEL;
  }
  return {
    post(signal) {
      try {
        raw.postMessage({ origin, previousUserId: signal.previousUserId, userId: signal.userId });
      } catch {
        // 알림 실패가 저장소 쓰기를 막지 않는다.
      }
    },
    subscribe(listener) {
      const onMessage = (event: { data: unknown }) => {
        const message = parseMessage(event.data);
        if (!message || message.origin === origin) return; // 모양이 틀렸거나 이 탭이 보낸 신호
        const signal: SessionSignal = { previousUserId: message.previousUserId, userId: message.userId };
        try {
          listener(signal);
        } catch {
          // 구독자 하나의 오류가 다른 구독자를 막지 않는다.
        }
      };
      raw.addEventListener('message', onMessage);
      return () => raw.removeEventListener('message', onMessage);
    },
    close() {
      try {
        raw.close();
      } catch {
        // 이미 닫힘
      }
    },
  };
}

const NOOP_CHANNEL: SessionChannel = { post() {}, subscribe: () => () => {}, close() {} };

const isIdOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

function parseMessage(data: unknown): (SessionSignal & { origin: string }) | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { origin, previousUserId, userId } = data as Record<string, unknown>;
  if (typeof origin !== 'string' || origin === '' || !isIdOrNull(previousUserId) || !isIdOrNull(userId)) return null;
  return { origin, previousUserId, userId };
}

/** 탭(채널 객체)마다 고유한 발신자 표식. 자기 신호를 걸러내는 데만 쓴다. */
function newOrigin(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
