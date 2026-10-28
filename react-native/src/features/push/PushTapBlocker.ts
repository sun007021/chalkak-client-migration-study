/** 업로드·피드백 작성 화면이 열려 있는지(REQ-PUSH-031). 열려 있는 동안 푸시 탭 처리를 보류한다. */
export interface PushTapBlocker {
  isBlocked(): boolean;
  /** 막힘 상태가 바뀔 때마다 호출된다. 반환 함수로 해제한다. */
  subscribe(listener: () => void): () => void;
}
