import { useMemo } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bytesToBase64 } from '../../core/encoding/base64';
import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { SignaturePreviewViewModel } from './SignaturePreviewViewModel';

/** 미리보기는 흰 획이 보이도록 어두운 배경 위에 얹는다(REQ-SIGN-010). 밝기는 휘도 0.3 미만. */
export const SIGNATURE_PREVIEW_BACKDROP_COLOR = '#222222';

/** testID는 testids.md의 signature-preview.*. 요청의 수명주기는 ViewModel(소유자 SignatureFlowViewModel)이 가진다. */
export function SignaturePreviewScreen({ viewModel }: { viewModel: SignaturePreviewViewModel }) {
  const { mode, busy, error } = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  const uri = useMemo(() => `data:image/png;base64,${bytesToBase64(viewModel.png)}`, [viewModel]);
  const change = mode === 'change';
  return (
    <View
      testID="signature-preview.root"
      accessibilityValue={{ text: mode }}
      style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
    >
      <Text testID="signature-preview.title" style={styles.title}>
        {t('onb.sign.preview.title')}
      </Text>
      <View
        testID="signature-preview.image"
        style={[styles.imageBox, { backgroundColor: SIGNATURE_PREVIEW_BACKDROP_COLOR }]}
      >
        <Image source={{ uri }} resizeMode="contain" style={styles.image} />
      </View>
      {change ? (
        <Text testID="signature-preview.change-notice" style={styles.notice}>
          {t('sign.change.notice')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {busy ? <ActivityIndicator testID="signature-preview.loading" /> : null}
        <Pressable
          testID="signature-preview.redraw-button"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => viewModel.redraw()}
          style={[styles.redraw, busy && styles.off]}
        >
          <Text style={styles.redrawText}>{t('onb.sign.preview.redraw')}</Text>
        </Pressable>
        <Pressable
          testID="signature-preview.confirm-button"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void viewModel.confirm()}
          style={[styles.confirm, busy && styles.off]}
        >
          <Text style={styles.confirmText}>
            {change ? t('sign.change.confirm') : t('onb.sign.preview.start')}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => viewModel.dismissError()}
        >
          <View testID="signature-preview.error-dialog" style={styles.backdrop}>
            <View style={styles.dialog}>
              <Text testID="signature-preview.error-message" style={styles.dialogMessage}>
                {error.message}
              </Text>
              <Pressable
                testID="signature-preview.error-dialog-confirm-button"
                accessibilityRole="button"
                onPress={() => viewModel.dismissError()}
                style={styles.dialogConfirm}
              >
                <Text style={styles.confirmText}>{t('common.confirm')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 24 },
  title: { marginTop: 24, fontSize: 26, fontWeight: '700', color: '#111111' },
  imageBox: {
    marginTop: 24,
    width: '100%',
    aspectRatio: 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  notice: { marginTop: 16, textAlign: 'center', fontSize: 13, color: '#666666' },
  actions: { marginTop: 'auto', gap: 12 },
  redraw: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redrawText: { fontSize: 15, color: '#333333' },
  confirm: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  off: { opacity: 0.5 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  dialogMessage: { fontSize: 15, textAlign: 'center', color: '#333333' },
  dialogConfirm: {
    marginTop: 24,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
});
