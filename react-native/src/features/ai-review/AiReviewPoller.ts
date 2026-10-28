/**
 * AI 피드백 상태 확인·폴링(D-03: 3초 간격 300초 창, 화면이 보일 때만).
 * 폴러는 앱에 하나라서 화면(홈, 상세)이 `owner`(보통 자기 자신)를 넘겨 자기가 시작한 폴링만 멈춘다.
 * 카드의 문구·요청·폴링 로직은 AI 피드백 영역이다.
 */
export interface AiReviewPoller {
  /** 이 게시물의 상태를 GET부터 확인하고 필요하면 폴링한다. 같은 게시물로 다시 부르면 새 창을 시작한다. */
  start(postId: string, owner?: object): void;
  /** 폴링을 멈춘다(화면 이탈, 카드 사라짐). 결과 상태는 지우지 않는다. owner가 지금 단위의 소유자가 아니면 무시한다. */
  stop(owner?: object): void;
}
