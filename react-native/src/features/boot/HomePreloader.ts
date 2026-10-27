export type PreloadMode = 'member' | 'guest';

/** 홈 데이터 프리로드. guest면 공개 데이터(랭킹, 배너)만 부른다. 실패는 reject(홈 화면이 오류 상태로 연다). */
export interface HomePreloader {
  preload(mode: PreloadMode): Promise<void>;
}
