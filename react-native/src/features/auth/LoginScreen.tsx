import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { Dialog, DialogButton } from '../../shared/ui/Dialog';
import { Text } from '../../shared/ui/Text';
import type { LoginViewModel } from './LoginViewModel';

// 원본 로그인(screens-a.md §4): 헤더는 화면 높이의 0.53, 배경 이미지 alpha 0.2, 타이틀 display(가로 20, 위 135),
// 액션 영역 가로 25 / 위 60 / 아래 56, 소셜 버튼 높이 56 · 간격 12 · 라운드 12 · inputBackground + 1px border.
const HEADER_RATIO = 0.53;
const BUTTON_HEIGHT = 56;
const LOGO = 20;
const LOGIN_BACKGROUND = require('../../../assets/images/img_login_background.jpg');
const KAKAO_LOGO = require('../../../assets/images/img_kakao_logo.png');

/**
 * testID는 docs/testing/testids.md의 login.* 그대로. 상태는 useViewModelState로 구독만 한다.
 * ViewModel의 생성·dispose·screen_view는 소유자(LoginViewModelOwner)가 하므로 이 화면은 수명주기를 다루지 않는다.
 */
export function LoginScreen({ viewModel }: { viewModel: LoginViewModel }) {
  const { busy, error } = useViewModelState(viewModel);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View testID="login.root" style={styles.root}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { height: height * HEADER_RATIO }]}>
          <Image source={LOGIN_BACKGROUND} resizeMode="cover" style={styles.headerImage} />
          <Text
            testID="login.tagline"
            style={[styles.tagline, { marginTop: Math.max(insets.top, 24) + 111 }]}
          >
            {t('auth.login.tagline')}
          </Text>
        </View>
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 0) + 56 }]}>
          <Pressable
            testID="login.kakao-button"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void viewModel.onKakaoPress()}
            style={({ pressed }) => [styles.social, (pressed || busy) && styles.socialPressed]}
          >
            {busy ? (
              <ActivityIndicator testID="login.loading" size="small" color={colors.textMuted} />
            ) : (
              <Image source={KAKAO_LOGO} style={styles.socialLogo} />
            )}
            <Text style={[styles.socialText, busy && { color: colors.textMuted }]}>
              {t('auth.login.kakao')}
            </Text>
          </Pressable>
          <Pressable
            testID="login.guest-button"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void viewModel.onGuestPress()}
            style={styles.guest}
          >
            <Text style={[styles.guestText, busy && { color: colors.textMuted }]}>
              {t('auth.login.guest')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      {error ? (
        <Dialog
          testID="login.error-dialog"
          title={t('auth.login.error.title')}
          message={error.message}
          onRequestClose={() => viewModel.dismissError()}
          actions={
            <DialogButton
              testID="login.error-dialog-confirm-button"
              label={t('common.confirm')}
              onPress={() => viewModel.dismissError()}
            />
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  header: { overflow: 'hidden' },
  headerImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', opacity: 0.2 },
  tagline: { ...typography.display, color: colors.textPrimary, paddingHorizontal: 20 },
  actions: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 60,
    gap: spacing.md,
  },
  social: {
    height: BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
  },
  socialPressed: { opacity: 0.7 },
  socialLogo: { width: LOGO, height: LOGO },
  socialText: { ...typography.callout, color: colors.textPrimary },
  guest: {
    minHeight: 44,
    marginTop: spacing.xl - spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestText: {
    ...typography.subheadline,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
