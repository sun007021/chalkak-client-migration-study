import type { ReactNode } from 'react';
import type { UploadSuccessViewModel } from './UploadSuccessViewModel';

type Props = { viewModel: UploadSuccessViewModel };

/** 업로드 성공 화면. testID는 docs/testing/testids.md의 upload-success.*. */
export function UploadSuccessScreen({ viewModel }: Props): ReactNode {
  void viewModel;
  throw new Error('not implemented');
}
