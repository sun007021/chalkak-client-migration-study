import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bytesToBase64 } from '../../core/encoding/base64';
import { useViewModelState } from '../../core/state/useViewModelState';
import { format, t } from '../../shared/copy';
import { POST_TITLE_MAX } from '../../shared/constants';
import { colors, spacing } from '../../shared/ui/theme';
import { rotatedSize } from '../photo-edit/PhotoEditTransform';
import { PhotoEditScreen } from '../photo-edit/PhotoEditScreen';
import { encodePng } from '../signature/encodePng';
import { localCopy, titleCounterText } from './localCopy';
import type { PhotoUploadViewModel, SelectedPhoto } from './PhotoUploadViewModel';

type Props = { viewModel: PhotoUploadViewModel };

/**
 * 업로드 화면. testID는 docs/testing/testids.md의 upload.*. 마운트되면 viewModel.start()(멱등)로 주제를 불러온다.
 * 편집기는 이 화면 위에 덮어 그린다(viewModel.editor). ViewModel을 만들고 버리는 것은 라우트(소유자)다.
 */
export function PhotoUploadScreen({ viewModel }: Props): ReactNode {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void viewModel.start();
  }, [viewModel]);

  const editor = state.editing ? viewModel.editor : null;
  const topic = state.topic;

  return (
    <View testID="upload.root" style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            testID="upload.close-button"
            accessibilityRole="button"
            accessibilityLabel={localCopy.closeA11y}
            onPress={() => viewModel.close()}
            hitSlop={12}
          >
            <Text style={styles.close}>{'✕'}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {topic.status === 'error' ? (
            <View style={styles.errorState}>
              <Text testID="upload.error-state" style={styles.errorText}>
                {topic.message}
              </Text>
              <Pressable
                testID="upload.retry-button"
                accessibilityRole="button"
                onPress={() => void viewModel.retryTopic()}
                style={styles.retry}
              >
                <Text style={styles.retryText}>{t('upload.topic.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text testID="upload.topic-title" style={styles.heading}>
                {topic.status === 'ready'
                  ? format(t('upload.heading'), { 주제: topic.title })
                  : ' '}
              </Text>
              <Text testID="upload.guide-text" style={styles.guide}>
                {t('upload.subheading')}
              </Text>
            </>
          )}

          {state.photo ? <PhotoPreview viewModel={viewModel} photo={state.photo} /> : null}
          {state.photoLoading ? <ActivityIndicator style={styles.loading} /> : null}

          <View style={styles.pickRow}>
            <PickButton
              testID="upload.album-button"
              label={localCopy.albumButton}
              onPress={() => void viewModel.pickFromLibrary()}
              disabled={state.submitting}
            />
            {state.cameraAvailable ? (
              <PickButton
                testID="upload.camera-button"
                label={localCopy.cameraButton}
                onPress={() => void viewModel.capture()}
                disabled={state.submitting}
              />
            ) : null}
          </View>

          <View style={styles.titleBox}>
            <TextInput
              testID="upload.title-input"
              value={state.title}
              onChangeText={(text) => viewModel.setTitle(text)}
              placeholder={t('upload.caption.placeholder')}
              placeholderTextColor={colors.textSecondary}
              editable={!state.submitting}
              returnKeyType="done"
              style={styles.titleInput}
            />
            <Text testID="upload.title-counter" style={styles.counter}>
              {titleCounterText(state.titleLength, POST_TITLE_MAX)}
            </Text>
          </View>

          {state.preparation === 'preparing' && state.photo ? (
            <View testID="upload.preparing-indicator" style={styles.status}>
              <ActivityIndicator size="small" />
            </View>
          ) : null}
          {state.error ? (
            <Text testID="upload.error-message" style={styles.errorMessage}>
              {state.error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Pressable
            testID="upload.submit-button"
            accessibilityRole="button"
            disabled={!state.canSubmit}
            onPress={() => void viewModel.submit()}
            style={[styles.submit, !state.canSubmit && styles.submitDisabled]}
          >
            {state.submitting ? (
              <ActivityIndicator testID="upload.submitting-indicator" color="#FFFFFF" />
            ) : null}
            <Text style={styles.submitText}>
              {state.submitting ? t('upload.submitting') : t('upload.submit')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {state.permissionPrompt ? <PermissionDialog viewModel={viewModel} /> : null}
      {editor ? <PhotoEditScreen viewModel={editor} /> : null}
    </View>
  );
}

function PickButton(props: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.pick, props.disabled && styles.pickDisabled]}
    >
      <Text style={styles.pickText}>{props.label}</Text>
    </Pressable>
  );
}

/** 확정한 사진: 편집 결과(자르기 비율)로 보이고, 누르면 편집기가 다시 열린다. 결과 그림을 만들 수 없으면 원본을 보인다. */
function PhotoPreview({
  viewModel,
  photo,
}: {
  viewModel: PhotoUploadViewModel;
  photo: SelectedPhoto;
}) {
  const [result, setResult] = useState<{ photo: SelectedPhoto; uri: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void viewModel.previewPixels().then((image) => {
      if (cancelled || !image) return;
      const png = encodePng(new Uint8Array(image.data.buffer), image.width, image.height);
      setResult({ photo, uri: `data:image/png;base64,${bytesToBase64(png)}` });
    });
    return () => {
      cancelled = true;
    };
  }, [viewModel, photo]);
  // 다른 사진의 결과 그림은 쓰지 않는다.
  const uri = result?.photo === photo ? result.uri : null;

  const rotated = rotatedSize(photo, photo.edit.quarterTurns);
  const aspectRatio =
    (rotated.width * photo.edit.crop.width) / (rotated.height * photo.edit.crop.height);
  return (
    <Pressable
      testID="upload.photo-preview"
      accessibilityRole="imagebutton"
      accessibilityLabel={localCopy.previewA11y}
      onPress={() => void viewModel.editPhoto()}
      style={[styles.preview, { aspectRatio }]}
    >
      <Image source={{ uri: uri ?? photo.uri }} resizeMode="cover" style={styles.previewImage} />
    </Pressable>
  );
}

/** iOS: 촬영 사진 저장 권한이 없을 때의 안내. */
function PermissionDialog({ viewModel }: { viewModel: PhotoUploadViewModel }) {
  return (
    <View style={styles.dialogLayer}>
      <View style={styles.dialog}>
        <Text testID="upload.camera-permission-dialog" style={styles.dialogTitle}>
          {t('upload.permission.save')}
        </Text>
        <Text style={styles.dialogBody}>{localCopy.permissionBody}</Text>
        <DialogButton
          testID="upload.camera-permission-settings-button"
          label={t('upload.permission.settings')}
          onPress={() => void viewModel.openPermissionSettings()}
          primary
        />
        <DialogButton
          testID="upload.camera-permission-shoot-button"
          label={t('upload.no-save-capture')}
          onPress={() => void viewModel.captureWithoutSaving()}
        />
        <DialogButton
          testID="upload.camera-permission-cancel-button"
          label={localCopy.permissionCancel}
          onPress={() => viewModel.dismissPermissionPrompt()}
        />
      </View>
    </View>
  );
}

function DialogButton(props: {
  testID: string;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      onPress={props.onPress}
      style={styles.dialogButton}
    >
      <Text style={[styles.dialogButtonText, props.primary && styles.dialogButtonPrimary]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, alignItems: 'flex-end' },
  close: { fontSize: 20, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  guide: { fontSize: 14, color: colors.textSecondary },
  errorState: { gap: spacing.md, alignItems: 'flex-start' },
  errorText: { fontSize: 15, color: colors.textPrimary },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  retryText: { color: colors.accent, fontWeight: '700' },
  loading: { alignSelf: 'center' },
  preview: {
    width: '100%',
    maxHeight: 420,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignSelf: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  pickRow: { flexDirection: 'row', gap: spacing.md },
  pick: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pickDisabled: { opacity: 0.5 },
  pickText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  titleBox: { borderBottomWidth: 1, borderColor: colors.border, paddingBottom: spacing.xs },
  titleInput: { fontSize: 16, color: colors.textPrimary, paddingVertical: spacing.sm },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: colors.textSecondary },
  status: { alignItems: 'center' },
  errorMessage: { color: colors.danger, fontSize: 14 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  submit: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  submitDisabled: { backgroundColor: colors.border },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  dialogLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  dialogBody: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.sm },
  dialogButton: { paddingVertical: spacing.md, alignItems: 'center' },
  dialogButtonText: { fontSize: 15, color: colors.textPrimary },
  dialogButtonPrimary: { color: colors.accent, fontWeight: '700' },
});
