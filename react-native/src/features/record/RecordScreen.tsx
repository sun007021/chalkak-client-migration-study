import type { RecordViewModel } from './RecordViewModel';

/** 기록 탭 화면. testID는 docs/testing/testids.md의 record 표를 따른다. 마운트 = onShown, 언마운트 = onHidden. */
export function RecordScreen({ viewModel }: { viewModel: RecordViewModel }): never {
  void viewModel;
  throw new Error('not implemented');
}
