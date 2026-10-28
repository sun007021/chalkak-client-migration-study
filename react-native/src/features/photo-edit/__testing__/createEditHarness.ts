import { FakeLocalFiles } from '../../../core/media/__testing__/FakeLocalFiles';
import type { AnalysisSampleRequest } from '../ImageEngine';
import type { RgbaImage, Size } from '../ImageTypes';
import type { PhotoEdit } from '../PhotoEdit';
import { PhotoEditViewModel } from '../PhotoEditViewModel';
import { FakeImageEngine } from './FakeImageEngine';

export const EDIT_SOURCE_URI = 'file:///picked/edit-source.jpg';

export type EditHarnessOptions = {
  sourceSize?: Size;
  initialEdit?: PhotoEdit | null;
  sample?: (request: AnalysisSampleRequest) => RgbaImage | null;
};

export function createEditHarness(options: EditHarnessOptions = {}) {
  const files = new FakeLocalFiles();
  const engine = new FakeImageEngine(files);
  const sourceSize = options.sourceSize ?? { width: 4000, height: 3000 };
  engine.sizes.set(EDIT_SOURCE_URI, sourceSize);
  if (options.sample) engine.sample = options.sample;
  const done: PhotoEdit[] = [];
  const cancels: number[] = [];
  const viewModel = new PhotoEditViewModel({
    engine,
    files,
    sourceUri: EDIT_SOURCE_URI,
    sourceSize,
    initialEdit: options.initialEdit ?? null,
    onDone: (edit) => done.push(edit),
    onCancel: () => cancels.push(1),
  });
  return { engine, files, viewModel, done, cancels, sourceSize };
}

export type EditHarness = ReturnType<typeof createEditHarness>;

/** 단색 표본 이미지. */
export function solidImage(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return { width, height, data };
}

/** 가로로 from..to 회색이 균일하게 이어지는 표본 이미지. */
export function grayRamp(width: number, height: number, from: number, to: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = Math.round(from + ((to - from) * x) / Math.max(1, width - 1));
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}
