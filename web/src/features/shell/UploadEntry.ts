/** 업로드 진입 게이트(D-14 1단계, UPL 영역). 셸은 회원이 업로드 버튼을 눌렀을 때 start()만 부른다. 중복 방지는 구현이 한다(REQ-NAV-035). */
export interface UploadEntry {
  start(): void;
}

/** 업로드 PR 전까지의 기본값. */
export class NoopUploadEntry implements UploadEntry {
  start(): void {}
}
