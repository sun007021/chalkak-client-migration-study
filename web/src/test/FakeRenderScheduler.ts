import type { RenderScheduler } from '../features/upload/editor/editorPorts';

/** 프레임 스케줄러 Fake: 예약만 쌓아 두고 flush()로 한 번에 실행한다(실제 rAF 없이 결정적으로). */
export class FakeRenderScheduler implements RenderScheduler {
  private queue: { id: number; callback: () => void }[] = [];
  private nextId = 1;
  /** 지금까지 예약한 횟수(취소 포함). */
  scheduled = 0;

  schedule(callback: () => void): () => void {
    const id = this.nextId++;
    this.scheduled += 1;
    this.queue.push({ id, callback });
    return () => {
      this.queue = this.queue.filter((entry) => entry.id !== id);
    };
  }

  get pending(): number {
    return this.queue.length;
  }

  flush(): void {
    const run = this.queue;
    this.queue = [];
    for (const entry of run) entry.callback();
  }
}
