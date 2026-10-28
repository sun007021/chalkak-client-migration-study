import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// 앱 타이머는 FakeClock으로 돌리므로 findBy/waitFor가 기다리는 것은 실제 렌더링뿐이다.
// 전체 실행에서 jsdom 파일 100개가 병렬로 돌면 렌더가 1초를 넘길 때가 있어 기본값(1초)보다 넉넉히 둔다.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
