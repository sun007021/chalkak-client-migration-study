import type { RenderScheduler } from './editorPorts';

/** 실제 프레임 스케줄러: 다음 그리기 프레임에 한 번 실행한다. 프레임을 그리지 않는 탭(백그라운드)에서는 브라우저가 멈추므로 돌아오면 이어서 실행된다. */
export class BrowserRenderScheduler implements RenderScheduler {
  schedule(callback: () => void): () => void {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  }
}
