import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, spacing, typography } from '../../shared/design/tokens';
import { ChalkakButton } from '../../shared/ui/Button';
import { Text } from '../../shared/ui/Text';
import type { UploadSuccessViewModel } from './UploadSuccessViewModel';

type Props = { viewModel: UploadSuccessViewModel };

/**
 * 업로드 성공 화면. testID는 docs/testing/testids.md의 upload-success.*. 마운트되면 screen_view를 한 번 보낸다(start는 멱등).
 * 원본(screens-b.md §5.4): 제목 title1(좌우 25), 검수 안내 footnote textSecondary(위 10), 하단 "확인했어요." 버튼(좌우 24, 아래 26).
 */
export function UploadSuccessScreen({ viewModel }: Props): ReactNode {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    viewModel.start();
  }, [viewModel]);

  return (
    <View
      testID="upload-success.root"
      style={[styles.root, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 26 }]}
    >
      <View style={styles.body}>
        <Text testID="upload-success.message" style={styles.message}>
          {state.message}
        </Text>
        <Text testID="upload-success.status-message" style={styles.status}>
          {state.statusMessage}
        </Text>
      </View>
      <View style={styles.footer}>
        <ChalkakButton
          testID="upload-success.confirm-button"
          label={t('upload.success.confirm')}
          onPress={() => viewModel.confirm()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: spacing.screenHorizontal },
  message: { ...typography.title1, color: colors.textPrimary },
  status: { ...typography.footnote, marginTop: 10, color: colors.textSecondary },
  footer: { paddingHorizontal: spacing.xl },
});
