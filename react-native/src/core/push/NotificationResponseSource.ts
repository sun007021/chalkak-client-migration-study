/** 푸시 `data` 맵(서버 계약상 값은 문자열이지만 플러그인 경계에서는 unknown으로 받아 PushPayload가 거른다). */
export type PushData = Readonly<Record<string, unknown>>;

/** 사용자가 알림을 탭한 이벤트. */
export interface NotificationResponseSource {
  /** 알림 탭으로 콜드 스타트된 경우의 data. 한 번 소비하면 이후에는 null. */
  consumeInitial(): Promise<PushData | null>;
  /** 앱이 떠 있는 동안(백그라운드·포그라운드) 알림을 탭할 때마다 호출된다. 반환 함수로 해제한다. */
  subscribe(listener: (data: PushData) => void): () => void;
}
