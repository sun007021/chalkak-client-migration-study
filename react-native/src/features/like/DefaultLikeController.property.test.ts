import { createLikeHarness, P1, settle } from './__testing__/createLikeHarness';

/** 재현 가능한 의사 난수(mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('DefaultLikeController 속성 테스트', () => {
  it('TC-LIKE-017 임의 탭 순서(길이 1~9)와 응답 지연에서도 동시 진행 요청 ≤1이고 최종 서버 상태가 마지막 의도와 같다', async () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = rng(seed);
      const h = createLikeHarness();
      const startLiked = random() < 0.5;
      const startCount = 5;
      h.api.setServer(P1, startCount, startLiked);
      const taps = 1 + Math.floor(random() * 9);
      let displayed = { postId: P1, likeCount: startCount, isLiked: startLiked };
      h.controller.subscribe((c) => {
        if (c.kind === 'updated') displayed = c.snapshot;
      });
      for (let i = 0; i < taps; i += 1) {
        h.controller.toggle(displayed);
        if (random() < 0.5 && h.api.pending.length > 0) {
          h.api.succeed(h.api.pending[0]);
          await settle();
        }
      }
      while (h.api.pending.length > 0) {
        h.api.succeed(h.api.pending[0]);
        await settle();
      }
      const intended = taps % 2 === 1 ? !startLiked : startLiked;
      expect(h.api.maxInFlightPerPost).toBeLessThanOrEqual(1);
      expect({ seed, liked: h.api.serverState(P1).isLiked }).toEqual({ seed, liked: intended });
      expect(h.controller.snapshot(P1)).toMatchObject({ isLiked: intended });
    }
  });
});
