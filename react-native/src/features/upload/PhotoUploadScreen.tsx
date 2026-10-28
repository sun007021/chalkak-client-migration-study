import type { ReactNode } from 'react';
import type { PhotoUploadViewModel } from './PhotoUploadViewModel';

type Props = { viewModel: PhotoUploadViewModel };

/** 업로드 화면. 편집기가 열려 있으면 그 위에 전체 화면으로 PhotoEditScreen을 그린다. testID는 docs/testing/testids.md의 upload.*. */
export function PhotoUploadScreen({ viewModel }: Props): ReactNode {
  void viewModel;
  throw new Error('not implemented');
}
