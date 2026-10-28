export type AppState = 'foreground' | 'background';

/** 앱의 포그라운드/백그라운드 전환 알림. 구현은 RN AppState를 감싼다. */
export interface AppVisibility {
  current(): AppState;
  /** 전환될 때마다 호출된다. 반환 함수로 해제한다. */
  subscribe(listener: (state: AppState) => void): () => void;
}
