import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useViewModelState } from '../core/state/useViewModelState';
import type { UploadEntryGateViewModel } from '../features/upload/UploadEntryGateViewModel';
import { localCopy } from '../features/upload/localCopy';
import { useAppContainer } from './AppContainerContext';

/** 업로드 진입 확인(GET /posts/today) 중에만 화면 위에 표시를 그린다. 확인이 끝날 때까지 아래 화면의 터치를 막는다(연타 방지). */
export function UploadEntryOverlay() {
  const { uploadGateOwner } = useAppContainer();
  const { viewModel } = useViewModelState(uploadGateOwner);
  return viewModel ? <Checking viewModel={viewModel} /> : null;
}

function Checking({ viewModel }: { viewModel: UploadEntryGateViewModel }) {
  const { checking } = useViewModelState(viewModel);
  if (!checking) return null;
  return (
    <View
      testID="upload-entry.loading"
      accessibilityLabel={localCopy.gateChecking}
      accessibilityLiveRegion="polite"
      style={styles.layer}
    >
      <ActivityIndicator size="large" color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
