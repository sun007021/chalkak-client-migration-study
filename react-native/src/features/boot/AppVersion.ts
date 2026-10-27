export type AppVersion = { major: number; minor: number; patch: number };

/** "1.2.3", "1.1"(patch=0)만 허용. 그 밖(구성 수 1/4, 숫자 아님, 음수, 빈 문자열)은 null. */
export function parseAppVersion(text: string): AppVersion | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) };
}

/** 스토어 버전의 major 또는 minor가 설치 버전보다 높을 때만 true. patch 차이·낮은 버전은 false(REQ-BOOT-006). */
export function isUpdateRequired(installed: AppVersion, store: AppVersion): boolean {
  if (store.major !== installed.major) return store.major > installed.major;
  return store.minor > installed.minor;
}
