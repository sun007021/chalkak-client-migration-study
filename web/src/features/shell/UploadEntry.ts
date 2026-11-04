/** 업로드 진입 게이트(D-14 1단계, UPL 영역). 셸·홈 히어로는 회원이 업로드 버튼을 눌렀을 때 start()만 부른다. 중복 방지는 구현이 한다(REQ-NAV-035). */
export interface UploadEntry {
  start(): void;
  /** 확인 중인 요청을 취소하고 결과를 버린다(버튼이 있던 화면이 사라질 때, 계정 전환). 확인 중이 아니면 아무 일도 없다. */
  cancel(): void;
}

/** 진입 구현이 없는 환경의 기본값(UploadGate가 실제 구현). */
export class NoopUploadEntry implements UploadEntry {
  start(): void {}
  cancel(): void {}
}
