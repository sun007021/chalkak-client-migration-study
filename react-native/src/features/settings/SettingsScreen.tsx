import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import type { PushSettingKey } from '../../data/settings/NotificationSettingsRepository';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
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
  return (
    <View style={styles.guest}>
      <Pressable
        testID="settings.login-button"
        accessibilityRole="button"
        onPress={() => void viewModel.onLoginPress()}
        style={styles.loginButton}
      >
        <Text style={styles.loginText}>{t('settings.guest.login')}</Text>
      </Pressable>
    </View>
  );
}

function MemberBody({ viewModel }: { viewModel: SettingsViewModel }) {
  const { version } = useViewModelState(viewModel);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title={t('settings.section.app')}>
        <SignatureCard viewModel={viewModel.signatureCard} />
      </Section>
      <PushSection viewModel={viewModel} />
      <Section title={t('settings.section.account')}>
        <Row
          testID="settings.logout-row"
          label={t('settings.row.logout')}
          onPress={() => viewModel.onLogoutPress()}
        />
        <Row
          testID="settings.withdraw-row"
          label={t('settings.row.withdraw')}
          onPress={() => viewModel.onWithdrawPress()}
        />
      </Section>
      <Section title={t('settings.section.feedback')}>
        <Row
          testID="settings.feedback-row"
          label={t('settings.row.feedback')}
          onPress={() => viewModel.onFeedbackPress()}
        />
      </Section>
      <Section title={t('settings.section.info')}>
        <Row
          testID="settings.privacy-row"
          label={t('settings.row.privacy')}
          onPress={() => viewModel.onPrivacyPress()}
        />
        <Row
          testID="settings.terms-row"
          label={t('settings.row.terms')}
          onPress={() => viewModel.onTermsPress()}
        />
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
    <View testID="settings.push-section">
      <Text style={styles.sectionTitle}>{t('settings.section.push')}</Text>
      <View style={styles.sectionBody}>
        {push.status === 'loading' ? <Text testID="settings.push-loading">…</Text> : null}
        {push.status === 'error' ? (
          <View>
            <Text testID="settings.push-error" style={styles.error}>
              {t('settings.push.load-error')}
            </Text>
            <Pressable
              testID="settings.push-retry-button"
              accessibilityRole="button"
              onPress={() => void viewModel.retryPush()}
            >
              <Text style={styles.retry}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
        {SWITCHES.map(({ key, testID, labelKey }) => (
          <View key={key} style={styles.row}>
            <Text style={styles.rowLabel}>{t(labelKey)}</Text>
            <Switch
              testID={testID}
              accessibilityRole="switch"
              value={push.values?.[key] ?? false}
              disabled={!usable}
              accessibilityState={{ disabled: !usable }}
              onValueChange={() => void viewModel.onPushToggle(key)}
            />
          </View>
        ))}
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
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => viewModel.onDialogCancel()}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text testID={`settings.${kind}-dialog`} style={styles.dialogText}>
            {kind === 'logout'
              ? t('auth.logout.confirm.message')
              : t('auth.withdraw.confirm.message')}
          </Text>
          <View style={styles.dialogButtons}>
            <Pressable
              testID={`settings.${kind}-cancel-button`}
              accessibilityRole="button"
              onPress={() => viewModel.onDialogCancel()}
            >
              <Text style={styles.dialogCancel}>{t('auth.confirm.cancel')}</Text>
            </Pressable>
            <Pressable
              testID={`settings.${kind}-confirm-button`}
              accessibilityRole="button"
              accessibilityState={{ disabled: pending !== 'none' }}
              disabled={pending !== 'none'}
              onPress={() => void viewModel.onDialogConfirm()}
            >
              <Text style={[styles.dialogConfirm, kind === 'withdraw' && styles.danger]}>
                {kind === 'logout' ? t('auth.logout.confirm.ok') : t('auth.withdraw.confirm.ok')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row(props: {
  testID: string;
  label: string;
  onPress?: () => void;
  value?: string;
  valueTestID?: string;
}) {
  const { testID, label, onPress, value, valueTestID } = props;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined ? (
        <Text testID={valueTestID} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },
  guest: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  loginButton: {
    height: 52,
    alignSelf: 'stretch',
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  sectionBody: { gap: spacing.sm },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { fontSize: 16, color: colors.textPrimary },
  rowValue: { fontSize: 15, color: colors.textSecondary },
  error: { color: colors.danger, fontSize: 14 },
  retry: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    alignSelf: 'stretch',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  dialogText: { fontSize: 16, color: colors.textPrimary },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xl },
  dialogCancel: { fontSize: 15, color: colors.textSecondary },
  dialogConfirm: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  danger: { color: colors.danger },
});
