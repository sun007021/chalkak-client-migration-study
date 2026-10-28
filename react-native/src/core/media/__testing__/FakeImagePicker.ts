import type { ImagePicker, PickResult } from '../ImagePicker';

type Step = PickResult | Promise<PickResult> | Error;

/** 호출 순서대로 미리 정한 결과를 돌려준다. 다 쓰면 마지막 결과를 반복한다. */
export class FakeImagePicker implements ImagePicker {
  cameraAvailable = true;
  libraryCalls = 0;
  captureCalls = 0;
  private libraryResults: Step[] = [{ kind: 'cancelled' }];
  private captureResults: Step[] = [{ kind: 'cancelled' }];

  willPick(...results: Step[]): this {
    this.libraryResults = results;
    return this;
  }

  willCapture(...results: Step[]): this {
    this.captureResults = results;
    return this;
  }

  pickFromLibrary(): Promise<PickResult> {
    const step = this.libraryResults[Math.min(this.libraryCalls++, this.libraryResults.length - 1)];
    return FakeImagePicker.settle(step);
  }

  capture(): Promise<PickResult> {
    const step = this.captureResults[Math.min(this.captureCalls++, this.captureResults.length - 1)];
    return FakeImagePicker.settle(step);
  }

  private static settle(step: Step): Promise<PickResult> {
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(step);
  }
}

export const picked = (uri: string, width: number | null = null, height: number | null = null) =>
  ({ kind: 'picked', image: { uri, width, height } }) as const;
