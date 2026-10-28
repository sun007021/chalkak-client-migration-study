/**
 * 단조 시계(REQ-UPL-041). 기기 벽시계를 바꿔도 거꾸로 가거나 건너뛰지 않아 업로드 URL 만료 판정에 쓴다.
 * 벽시계(Clock)와 별개이며 값의 기준점은 의미가 없다(차이만 쓴다).
 */
export interface MonotonicClock {
  nowMs(): number;
}
