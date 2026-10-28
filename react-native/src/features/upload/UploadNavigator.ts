import type { KstDate } from '../../core/time/KstDate';
import type { TodayModerationStatus } from '../../data/post/PostModels';

export type UploadSuccessParams = {
  topicTitle: string;
  topicDate: KstDate;
  moderationStatus: TodayModerationStatus;
};

/** 업로드 흐름이 화면을 바꾸는 유일한 통로. 구현은 내비게이션(app)이 맡고 테스트는 Fake를 쓴다. */
export interface UploadNavigator {
  /** 게이트를 통과했다: 업로드 화면을 열고 topicDate를 고정한다(REQ-UPL-008). */
  openUpload(entry: { topicDate: KstDate }): void;
  /** 업로드 화면을 성공 화면으로 **바꾼다**(뒤로 가도 업로드 화면으로 돌아오지 않는다, REQ-UPL-064). */
  showSuccess(params: UploadSuccessParams): void;
  /** 업로드 화면 닫기(뒤로가기). */
  close(): void;
  /** "확인했어요.": 전시 탭의 업로드한 topicDate 날짜로(REQ-UPL-062). */
  openDisplay(topicDate: KstDate): void;
}
