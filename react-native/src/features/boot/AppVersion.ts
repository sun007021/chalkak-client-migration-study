export type AppVersion = { major: number; minor: number; patch: number };

/** "1.2.3", "1.1"(patch=0)만 허용. 그 밖(구성 수 1/4, 숫자 아님, 음수, 빈 문자열)은 null. */
export function parseAppVersion(_text: string): AppVersion | null {
  throw new Error('not implemented');
}

/** 스토어 버전의 major 또는 minor가 설치 버전보다 높을 때만 true. patch 차이·낮은 버전은 false(REQ-BOOT-006). */
export function isUpdateRequired(_installed: AppVersion, _store: AppVersion): boolean {
  throw new Error('not implemented');
}
