import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { flushAsync } from './FakeClock';

// 앱 타이머는 FakeClock으로 돌리므로 findBy/waitFor가 기다리는 것은 실제 렌더링뿐이다.
// 전체 실행에서 jsdom 파일 100개가 병렬로 돌면 렌더가 1초를 넘길 때가 있어 기본값(1초)보다 넉넉히 둔다.
//
// findBy/waitFor가 돌려주는 순간에 화면은 막 나타난 것일 뿐이다: 그 커밋의 패시브 효과(요청 시작, 센티넬 관찰)와 이미 온 응답이 일으킬 다음 렌더는
// 아직 act 밖에서 스케줄만 되어 있다. 테스트가 그 뒤에 동기로 단언하거나 가짜 시계를 밀면, 이 대기가 몇 번의 매크로태스크 안에 끝나는지(CPU 사정)에 결과가 달렸다.
// 그래서 대기 유틸이 끝난 뒤 act 안에서 보류 중인 효과·렌더·Promise 체인을 몇 라운드 비워 "나타났다"를 "나타났고 처리할 것은 처리됐다"로 만든다.
configure((previous) => ({
  asyncUtilTimeout: 5000,
  asyncWrapper: async (callback) => {
    const result = await previous.asyncWrapper(callback);
    for (let round = 0; round < 3; round += 1) {
      await act(async () => {
        await flushAsync();
      });
    }
    return result;
  },
}));

afterEach(() => {
  cleanup();
});
