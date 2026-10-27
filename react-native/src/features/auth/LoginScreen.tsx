import { useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { LoginViewModel } from './LoginViewModel';

/** testID는 docs/testing/testids.md의 login.* 그대로. 상태는 useViewModelState로 구독만 한다. */
export function LoginScreen({ viewModel }: { viewModel: LoginViewModel }) {
  const { busy, error } = useViewModelState(viewModel);

  useEffect(() => {
    viewModel.onScreenShown();
    // 화면이 사라지면 진행 중 요청을 취소하고 늦게 온 결과를 버린다.
    return () => viewModel.dispose();
  }, [viewModel]);

  return (
    <View testID="login.root" style={styles.root}>
      <Text testID="login.tagline" style={styles.tagline}>
        {t('auth.login.tagline')}
      </Text>
      <View style={styles.actions}>
        <Pressable
          testID="login.kakao-button"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void viewModel.onKakaoPress()}
          style={[styles.kakao, busy && styles.disabled]}
        >
          <Text style={styles.kakaoText}>{t('auth.login.kakao')}</Text>
        </Pressable>
        <Pressable
          testID="login.guest-button"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void viewModel.onGuestPress()}
          style={[styles.guest, busy && styles.disabled]}
        >
          <Text style={styles.guestText}>{t('auth.login.guest')}</Text>
        </Pressable>
        {busy ? <ActivityIndicator testID="login.loading" style={styles.loading} /> : null}
      </View>
      {error ? (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => viewModel.dismissError()}
        >
          <View testID="login.error-dialog" style={styles.backdrop}>
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>{t('auth.login.error.title')}</Text>
              <Text style={styles.dialogMessage}>{error.message}</Text>
              <Pressable
                testID="login.error-dialog-confirm-button"
                accessibilityRole="button"
                onPress={() => viewModel.dismissError()}
                style={styles.confirm}
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
  root: { flex: 1, justifyContent: 'space-between', padding: 24, backgroundColor: '#FFFFFF' },
  tagline: { marginTop: 120, fontSize: 28, fontWeight: '700', lineHeight: 38 },
  actions: { marginBottom: 32, gap: 12 },
  kakao: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE500',
  },
  kakaoText: { fontSize: 16, fontWeight: '600', color: '#191919' },
  guest: { height: 44, alignItems: 'center', justifyContent: 'center' },
  guestText: { fontSize: 14, color: '#666666', textDecorationLine: 'underline' },
  disabled: { opacity: 0.5 },
  loading: { marginTop: 8 },
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
  dialogTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  dialogMessage: { marginTop: 12, fontSize: 14, textAlign: 'center', color: '#444444' },
  confirm: {
    marginTop: 24,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
