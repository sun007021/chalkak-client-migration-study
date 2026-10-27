/** Promise의 상태를 동기적으로 들여다보기 위한 헬퍼(가짜 시계 테스트에서 "아직 끝나지 않았다"를 검증). */
export interface Tracked<T> {
  state: 'pending' | 'fulfilled' | 'rejected';
  value?: T;
  error?: unknown;
}

export function track<T>(promise: Promise<T>): Tracked<T> {
  const t: Tracked<T> = { state: 'pending' };
  promise.then(
    (value) => {
      t.state = 'fulfilled';
      t.value = value;
    },
    (error: unknown) => {
      t.state = 'rejected';
      t.error = error;
    },
  );
  return t;
}
