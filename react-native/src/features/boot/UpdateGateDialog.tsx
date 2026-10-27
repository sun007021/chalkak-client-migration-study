import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { UpdateDialogViewModel } from './UpdateDialogViewModel';

/**
 * 닫을 수 없는 강제 업데이트 다이얼로그. testID update-gate.*.
 * onRequestClose(안드로이드 뒤로가기)는 아무것도 하지 않고, 바깥 영역에는 닫기 동작이 없다.
 */
export function UpdateGateDialog({ viewModel }: { viewModel: UpdateDialogViewModel }) {
  const { opening } = useViewModelState(viewModel);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      testID="update-gate.dialog"
      onRequestClose={noop}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text testID="update-gate.title" style={styles.title}>
            {t('boot.update.title')}
          </Text>
          <Text testID="update-gate.message" style={styles.message}>
            {t('boot.update.body')}
          </Text>
          <Pressable
            testID="update-gate.update-button"
            accessibilityRole="button"
            disabled={opening}
            onPress={() => void viewModel.onUpdatePress()}
            style={[styles.button, opening && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>{t('boot.update.button')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function noop(): void {}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 320, borderRadius: 16, backgroundColor: '#FFFFFF', padding: 24 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  message: { marginTop: 12, fontSize: 14, textAlign: 'center', color: '#444444' },
  button: {
    marginTop: 24,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
