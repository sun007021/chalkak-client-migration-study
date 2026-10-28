import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import { Observable } from '../../core/state/Observable';
import type { UploadNavigator, UploadSuccessParams } from './UploadNavigator';

export type UploadSuccessState = {
  /** "‘{주제}’을/를 기록했어요." */
  message: string;
  /** PENDING이면 검수 대기 문구, 그 밖(VALIDATING)은 확인 중 문구. */
  statusMessage: string;
};

export type UploadSuccessDeps = {
  params: UploadSuccessParams;
  analytics: AnalyticsTracker;
  navigator: Pick<UploadNavigator, 'openDisplay'>;
};

/** 업로드 성공 화면(screen_view photo_upload_success). */
export class UploadSuccessViewModel extends Observable<UploadSuccessState> {
  constructor(private readonly deps: UploadSuccessDeps) {
    super(initialSuccessState());
    void this.deps;
  }

  /** screen_view를 한 번 보낸다. */
  start(): void {
    throw new Error('not implemented');
  }

  /** "확인했어요.": 전시 탭의 업로드한 날짜로 이동. */
  confirm(): void {
    throw new Error('not implemented');
  }
}

function initialSuccessState(): UploadSuccessState {
  throw new Error('not implemented');
}
