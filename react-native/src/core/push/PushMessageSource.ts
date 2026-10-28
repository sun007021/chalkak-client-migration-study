import type { PushData } from './NotificationResponseSource';

export type PushMessage = { data: PushData; title: string | null; body: string | null };

/** 앱이 실행 중일 때 도착한 푸시. */
export interface PushMessageSource {
  subscribe(listener: (message: PushMessage) => void): () => void;
}
