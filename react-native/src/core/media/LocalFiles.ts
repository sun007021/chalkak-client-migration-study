/** 앱이 만든 임시 파일(편집 미리보기, WebP 결과)을 읽고 지우는 경계. 구현 예: expo-file-system. */
export interface LocalFiles {
  readBytes(uri: string): Promise<Uint8Array>;
  /** 없는 파일이어도 던지지 않는다(멱등). */
  delete(uri: string): Promise<void>;
}
