import { View } from 'react-native';

import type { SignaturePreviewViewModel } from './SignaturePreviewViewModel';

/** 미리보기는 흰 획이 보이도록 어두운 배경 위에 얹는다(REQ-SIGN-010). 밝기는 휘도 0.3 미만. */
export const SIGNATURE_PREVIEW_BACKDROP_COLOR = '#FFFFFF';

export function SignaturePreviewScreen(_props: { viewModel: SignaturePreviewViewModel }) {
  return <View />;
}
