import type { CalendarImageModel } from '../features/record/calendarImage';
import type { CalendarImageExporter } from '../features/record/CalendarImageExporter';
import { deferred } from './deferred';
import { pngOf } from './pngBytes';

/** 실제 canvas 없이 정해진 PNG를 돌려주는 Fake. result를 바꾸면 이후 호출에 반영, fail을 주면 그 오류로 거절, hold()로 붙잡아 둘 수 있다. */
export class FakeCalendarImageExporter implements CalendarImageExporter {
  readonly models: CalendarImageModel[] = [];
  result: () => Blob = () => pngOf();
  fail: Error | null = null;
  private gate: ReturnType<typeof deferred<void>> | null = null;

  /** 다음 render를 release()까지 붙잡아 둔다(저장 중 상태·연타 검증). */
  hold(): void {
    this.gate = deferred<void>();
  }

  release(): void {
    this.gate?.resolve();
    this.gate = null;
  }

  async render(model: CalendarImageModel): Promise<Blob> {
    this.models.push(model);
    if (this.gate) await this.gate.promise;
    if (this.fail) throw this.fail;
    return this.result();
  }
}
