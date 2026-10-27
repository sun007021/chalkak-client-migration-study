export const SESSION_CHANNEL_NAME = 'chalkak-session';

/**
 * 다른 탭에 알리는 신호. 계정이 바뀐 쓰기·삭제 때만 보낸다(같은 계정의 토큰 갱신, 게스트 플래그, 빈 저장소 지우기는 보내지 않는다).
 * userId만 담고 토큰은 절대 담지 않는다.
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
export function createSessionChannel(_host: BroadcastChannelHost = globalThis as BroadcastChannelHost): SessionChannel {
  throw new Error('not implemented');
}
