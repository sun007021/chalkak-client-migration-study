import { useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bytesToBase64 } from '../../core/encoding/base64';
import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { SignaturePreviewViewModel } from './SignaturePreviewViewModel';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { ChalkakButton, ChalkakOutlinedButton } from '../../shared/ui/Button';
import { Dialog, DialogButton } from '../../shared/ui/Dialog';
import { Text } from '../../shared/ui/Text';

/** 미리보기는 흰 획이 보이도록 어두운 배경 위에 얹는다(REQ-SIGN-010). 밝기는 휘도 0.3 미만. */
export const SIGNATURE_PREVIEW_BACKDROP_COLOR = '#222222';

// 원본 미리보기(screens-a.md §6.2·6.4): 샘플 사진 5:6 라운드 xlarge(18) 위 우하단에 사인 112x84, 안쪽 8.
const PREVIEW_PHOTO = require('../../../assets/images/preview_photo.jpg');
const SIGN_WIDTH = 112;
const SIGN_HEIGHT = 84;

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
      style={[styles.root, { paddingTop: insets.top + 50, paddingBottom: insets.bottom + 18 }]}
    >
      <Text testID="signature-preview.title" style={styles.title}>
        {t('onb.sign.preview.title')}
      </Text>
      {change ? (
        <Text testID="signature-preview.change-notice" style={styles.notice}>
          {t('sign.change.notice')}
        </Text>
      ) : null}
      <View
        testID="signature-preview.image"
        accessibilityLabel="사진에 사인이 적용된 모습"
        style={[styles.imageBox, change ? styles.imageBoxChange : null]}
      >
        <Image source={PREVIEW_PHOTO} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <Image source={{ uri }} resizeMode="contain" style={styles.signature} />
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator testID="signature-preview.loading" color={colors.textOnImage} />
          </View>
        ) : null}
      </View>
      <View style={styles.spacer} />
      <View style={styles.actions}>
        <View style={styles.action}>
          <ChalkakOutlinedButton
            testID="signature-preview.redraw-button"
            label={t('onb.sign.preview.redraw')}
            disabled={busy}
            onPress={() => viewModel.redraw()}
          />
        </View>
        <View style={styles.action}>
          <ChalkakButton
            testID="signature-preview.confirm-button"
            label={change ? t('sign.change.confirm') : t('onb.sign.preview.start')}
            disabled={busy}
            onPress={() => void viewModel.confirm()}
          />
        </View>
      </View>
      {error ? (
        <Dialog
          testID="signature-preview.error-dialog"
          title=""
          onRequestClose={() => viewModel.dismissError()}
          actions={
            <DialogButton
              testID="signature-preview.error-dialog-confirm-button"
              label={t('common.confirm')}
              onPress={() => viewModel.dismissError()}
            />
          }
        >
          <Text testID="signature-preview.error-message" style={styles.dialogMessage}>
            {error.message}
          </Text>
        </Dialog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenHorizontal,
  },
  title: { ...typography.title1, color: colors.textPrimary },
  notice: { ...typography.subheadline, marginTop: spacing.sm, color: colors.textMuted },
  imageBox: {
    marginTop: 50,
    width: '100%',
    aspectRatio: 5 / 6,
    borderRadius: radius.xlarge,
    overflow: 'hidden',
    backgroundColor: SIGNATURE_PREVIEW_BACKDROP_COLOR,
  },
  imageBoxChange: { marginTop: 36 },
  signature: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: SIGN_WIDTH,
    height: SIGN_HEIGHT,
  },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  spacer: { flex: 1, minHeight: spacing.lg },
  actions: { flexDirection: 'row', gap: 20 },
  action: { flex: 1 },
  dialogMessage: {
    ...typography.callout,
    color: colors.textNeutral,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
