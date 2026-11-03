import { act } from '@testing-library/react';
import type { FakeClock } from './FakeClock';
import { flushAsync } from './FakeClock';

interface Settleable {
  clock: FakeClock;
  ff?: { calls: readonly unknown[] };
}

const MAX_ROUNDS = 20;

/**
 * 화면이 "가라앉을" 때까지 기다린다: 렌더 → 효과 → 요청 시작 → 응답 → 다시 렌더가 더 이어지지 않을 때까지.
 * act(async) 한 번 안에서는 중간에 생긴 렌더의 효과가 act가 끝나야 도는데, 가짜 시계의 advance()는 그 한 번 안에서 시간을 모두 밀어 버린다.
 * 그래서 렌더가 만든 요청(예: 센티넬이 보이는 효과가 시작한 다음 페이지 요청)이 시계를 민 뒤에야 대기를 시작하고, 그 재시도 타이머는 아무도 밀어 주지 않는다.
 * 그 요청이 시계를 밀기 전에 시작됐는지는 실제 스케줄링 속도에 달려 있어 CPU가 바쁠 때만 어긋났다. 시계를 밀기 전에 여기서 먼저 가라앉힌다.
 * 매 라운드를 별도의 act로 돌려 효과·상태 갱신을 라운드마다 비우고, 요청 수·대기 타이머 수가 두 라운드 연속 같으면 끝낸다.
 */
export async function settle(h: Settleable): Promise<void> {
  let stable = 0;
  let last = '';
  for (let round = 0; round < MAX_ROUNDS && stable < 2; round += 1) {
    await act(async () => {
      await flushAsync();
    });
    const now = `${h.ff?.calls.length ?? 0}/${h.clock.pendingTimers}`;
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}

/** 가라앉힌 뒤 가짜 시계를 ms만큼 민다(재시도 백오프·타임아웃). */
export async function advanceClock(h: Settleable, ms: number): Promise<void> {
  await settle(h);
  await act(async () => {
    await h.clock.advance(ms);
  });
}
