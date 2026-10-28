import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import type { UploadSuccessViewModel } from './UploadSuccessViewModel';

type Props = { viewModel: UploadSuccessViewModel };

/** 업로드 성공 화면. testID는 docs/testing/testids.md의 upload-success.*. 마운트되면 screen_view를 한 번 보낸다(start는 멱등). */
export function UploadSuccessScreen({ viewModel }: Props): ReactNode {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    viewModel.start();
  }, [viewModel]);

  return (
    <View
      testID="upload-success.root"
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.body}>
        <Text testID="upload-success.message" style={styles.message}>
          {state.message}
        </Text>
        <Text testID="upload-success.status-message" style={styles.status}>
          {state.statusMessage}
        </Text>
      </View>
      <Pressable
        testID="upload-success.confirm-button"
        accessibilityRole="button"
        onPress={() => viewModel.confirm()}
        style={styles.confirm}
      >
        <Text style={styles.confirmText}>{t('upload.success.confirm')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  message: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  status: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  confirm: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
