import type { ReactNode } from 'react';
import type { PhotoEditViewModel } from './PhotoEditViewModel';

type Props = { viewModel: PhotoEditViewModel };

/** 사진 편집기(업로드 화면 위 전체 화면). testID는 docs/testing/testids.md의 photo-edit.*. */
export function PhotoEditScreen({ viewModel }: Props): ReactNode {
  void viewModel;
  throw new Error('not implemented');
}
