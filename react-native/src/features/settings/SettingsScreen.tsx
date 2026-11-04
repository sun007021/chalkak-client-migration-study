import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import type { PushSettingKey } from '../../data/settings/NotificationSettingsRepository';
import { useGlassBarInset } from '../../shared/glass/glass';
import { t } from '../../shared/copy';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { Dialog, DialogButton } from '../../shared/ui/Dialog';
import { Icon } from '../../shared/ui/icons/Icon';
import { Skeleton } from '../../shared/ui/Skeleton';
import { Text } from '../../shared/ui/Text';
import { LegalDocSheet, type LegalDocWebView } from '../onboarding/LegalDocSheet';
import { SignatureCard } from '../signature/SignatureCard';
import type { SettingsViewModel } from './SettingsViewModel';

type Props = { viewModel: SettingsViewModel; WebView: LegalDocWebView };

/**
 * 설정 탭. testID는 testids.md의 settings.*. 마운트가 "보임", 언마운트가 "안 보임"이다(홈·기록과 같은 규칙).
 * 상태는 구독만 하고 분기 로직은 ViewModel이 가진다.
 */
export function SettingsScreen({ viewModel, WebView }: Props) {
  const { mode } = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  return (
    <View testID="settings.root" style={[styles.root, { paddingTop: insets.top }]}>
      {mode === 'guest' ? (
        <GuestBody viewModel={viewModel} />
      ) : (
        <MemberBody viewModel={viewModel} />
      )}
      <DocumentSheet viewModel={viewModel} WebView={WebView} />
    </View>
  );
}

function GuestBody({ viewModel }: { viewModel: SettingsViewModel }) {
  // 게스트: 행 전체가 actionPrimary인 로그인 버튼(screens-c.md §4.6).
  return (
    <View style={styles.guest}>
      <Pressable
        testID="settings.login-button"
        accessibilityRole="button"
        onPress={() => void viewModel.onLoginPress()}
        style={({ pressed }) => [styles.loginButton, pressed && styles.pressed]}
      >
        <Text style={styles.loginText}>{t('settings.guest.login')}</Text>
        <Icon name="ic_display_arrow_right" size={24} color={colors.onActionPrimary} />
      </Pressable>
    </View>
  );
}

function MemberBody({ viewModel }: { viewModel: SettingsViewModel }) {
  const { version } = useViewModelState(viewModel);
  const barInset = useGlassBarInset();
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + barInset }]}
      showsVerticalScrollIndicator={false}
    >
      <Section title={t('settings.section.app')}>
        <SignatureCard viewModel={viewModel.signatureCard} />
      </Section>
      <PushSection viewModel={viewModel} />
      <Section title={t('settings.section.account')} card>
        <Row
          testID="settings.logout-row"
          label={t('settings.row.logout')}
          onPress={() => viewModel.onLogoutPress()}
          trailing={<Icon name="ic_log_out" size={12} />}
        />
        <Divider />
        <Row
          testID="settings.withdraw-row"
          label={t('settings.row.withdraw')}
          onPress={() => viewModel.onWithdrawPress()}
          destructive
        />
      </Section>
      <Section title={t('settings.section.feedback')} card>
        <Row
          testID="settings.feedback-row"
          label={t('settings.row.feedback')}
          onPress={() => viewModel.onFeedbackPress()}
          chevron
        />
      </Section>
      <Section title={t('settings.section.info')} card>
        <Row
          testID="settings.privacy-row"
          label={t('settings.row.privacy')}
          onPress={() => viewModel.onPrivacyPress()}
          chevron
        />
        <Divider />
        <Row
          testID="settings.terms-row"
          label={t('settings.row.terms')}
          onPress={() => viewModel.onTermsPress()}
          chevron
        />
        <Divider />
        <Row
          testID="settings.version-row"
          label={t('settings.row.version')}
          value={version}
          valueTestID="settings.version-value"
        />
      </Section>
      <ConfirmDialogs viewModel={viewModel} />
    </ScrollView>
  );
}

const SWITCHES: { key: PushSettingKey; testID: string; labelKey: Parameters<typeof t>[0] }[] = [
  { key: 'topic', testID: 'settings.push-topic-toggle', labelKey: 'settings.push.topic' },
  {
    key: 'moderation',
    testID: 'settings.push-moderation-toggle',
    labelKey: 'settings.push.moderation',
  },
  { key: 'aiReview', testID: 'settings.push-ai-toggle', labelKey: 'settings.push.ai-review' },
];

function PushSection({ viewModel }: { viewModel: SettingsViewModel }) {
  const { push } = useViewModelState(viewModel);
  const usable = push.status === 'ready' && push.values !== null;
  return (
    <View testID="settings.push-section" style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.section.push')}</Text>
      <View style={styles.card}>
        {push.status === 'loading' ? (
          <View testID="settings.push-loading">
            <Skeleton style={styles.pushSkeleton} />
          </View>
        ) : null}
        {SWITCHES.map(({ key, testID, labelKey }, index) => (
          <View key={key}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              disabled={!usable}
              onPress={() => void viewModel.onPushToggle(key)}
              style={[styles.row, styles.switchRow]}
            >
              <Text style={styles.rowLabel}>{t(labelKey)}</Text>
              <Switch
                testID={testID}
                accessibilityRole="switch"
                value={push.values?.[key] ?? false}
                disabled={!usable}
                accessibilityState={{ disabled: !usable }}
                trackColor={{ false: colors.border, true: colors.actionPrimary }}
                ios_backgroundColor={colors.border}
                thumbColor={colors.surfaceElevated}
                onValueChange={() => void viewModel.onPushToggle(key)}
              />
            </Pressable>
          </View>
        ))}
        {push.status === 'error' ? (
          <View style={styles.pushError}>
            <Text testID="settings.push-error" style={styles.error}>
              {t('settings.push.load-error')}
            </Text>
            <Pressable
              testID="settings.push-retry-button"
              accessibilityRole="button"
              onPress={() => void viewModel.retryPush()}
              style={styles.retryButton}
            >
              <Text style={styles.retry}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ConfirmDialogs({ viewModel }: { viewModel: SettingsViewModel }) {
  const { dialog } = useViewModelState(viewModel);
  const { pending } = useViewModelState(viewModel.account);
  if (dialog === 'none') return null;
  const kind = dialog;
  return (
    <Dialog
      messageTestID={`settings.${kind}-dialog`}
      title={kind === 'logout' ? t('settings.row.logout') : t('settings.row.withdraw')}
      message={
        kind === 'logout' ? t('auth.logout.confirm.message') : t('auth.withdraw.confirm.message')
      }
      onRequestClose={() => viewModel.onDialogCancel()}
      actions={
        <>
          <DialogButton
            testID={`settings.${kind}-cancel-button`}
            tone="cancel"
            label={t('auth.confirm.cancel')}
            onPress={() => viewModel.onDialogCancel()}
          />
          <DialogButton
            testID={`settings.${kind}-confirm-button`}
            tone={kind === 'withdraw' ? 'destructive' : 'primary'}
            disabled={pending !== 'none'}
            label={kind === 'logout' ? t('auth.logout.confirm.ok') : t('auth.withdraw.confirm.ok')}
            onPress={() => void viewModel.onDialogConfirm()}
          />
        </>
      }
    />
  );
}

function DocumentSheet({ viewModel, WebView }: Props) {
  const openDocument = useViewModelState(viewModel, (state) => state.openDocument);
  const document = viewModel.document;
  if (openDocument === null || document === null) return null;
  return (
    <LegalDocSheet
      viewModel={document}
      WebView={WebView}
      onClose={() => viewModel.closeDocument()}
    />
  );
}

function Section({
  title,
  children,
  card = false,
}: {
  title: string;
  children: ReactNode;
  card?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {card ? <View style={styles.card}>{children}</View> : children}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function Row(props: {
  testID: string;
  label: string;
  onPress?: () => void;
  value?: string;
  valueTestID?: string;
  chevron?: boolean;
  destructive?: boolean;
  trailing?: ReactNode;
}) {
  const { testID, label, onPress, value, valueTestID, chevron, destructive, trailing } = props;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
      {value !== undefined ? (
        <Text testID={valueTestID} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      {chevron ? <Icon name="ic_display_arrow_right" size={24} color={colors.textMuted} /> : null}
      {trailing}
    </Pressable>
  );
}

// 원본 근거: docs/design/screens-c.md §1.5, §4.1 (카드 16, 행 좌우 20/위아래 16, 구분선 border, 섹션 라벨 callout textMuted).
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 48,
    paddingBottom: spacing.xxl,
    gap: 36,
  },
  guest: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.screenHorizontal },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: radius.large,
    backgroundColor: colors.actionPrimary,
  },
  pressed: { opacity: 0.85 },
  loginText: { ...typography.callout, color: colors.onActionPrimary },
  section: { gap: spacing.lg },
  sectionTitle: { ...typography.callout, color: colors.textMuted },
  card: {
    borderRadius: radius.large,
    backgroundColor: colors.surfaceElevated,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  switchRow: { paddingVertical: 10.5 },
  rowLabel: { ...typography.callout, color: colors.textPrimary, flex: 1 },
  rowValue: { ...typography.callout, color: colors.textMuted },
  destructive: { color: colors.destructive },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 20 },
  pushSkeleton: { height: 56, margin: spacing.md, borderRadius: radius.button },
  pushError: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: 20,
    paddingBottom: spacing.md,
  },
  error: { ...typography.caption, color: colors.error },
  retryButton: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  retry: { ...typography.caption, color: colors.textSecondary, textDecorationLine: 'underline' },
});
