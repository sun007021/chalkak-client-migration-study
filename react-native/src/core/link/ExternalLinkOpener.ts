/** 외부 브라우저(OS 기본 앱)로 URL을 연다. 열 수 없으면 false(예외를 던지지 않는다). */
export interface ExternalLinkOpener {
  open(url: string): Promise<boolean>;
}
