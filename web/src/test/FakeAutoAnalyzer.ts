import { NO_AUTO_VALUES } from '../features/upload/editModel';
import type { AdjustmentValues } from '../features/upload/editor/adjustments';
import type { AutoAnalysisRegion, AutoAnalyzer } from '../features/upload/editor/editorPorts';
import type { DecodedImage } from '../features/upload/imagePorts';
import { raceAbort } from './abortable';
import { deferred } from './deferred';
import type { Deferred } from './deferred';

/** 자동 보정 분석 Fake. 호출 기록과 결과(null = 분석 불가)를 조절한다. */
export class FakeAutoAnalyzer implements AutoAnalyzer {
  readonly calls: { image: DecodedImage; region: AutoAnalysisRegion; longEdge: number }[] = [];
  /** 다음 분석 결과. 함수면 호출마다 계산한다. 기본: 노출 0.4, 대비 0.2. */
  result: AdjustmentValues | null | ((region: AutoAnalysisRegion) => AdjustmentValues | null) = { ...NO_AUTO_VALUES, exposure: 0.4, contrast: 0.2 };
  private gate: Deferred<void> | null = null;

  hold(): Deferred<void> {
    this.gate = deferred<void>();
    return this.gate;
  }

  async analyze(image: DecodedImage, region: AutoAnalysisRegion, longEdge: number, signal: AbortSignal): Promise<AdjustmentValues | null> {
    this.calls.push({ image, region, longEdge });
    if (this.gate) await raceAbort(this.gate.promise, signal);
    else if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    return typeof this.result === 'function' ? this.result(region) : this.result;
  }
}
