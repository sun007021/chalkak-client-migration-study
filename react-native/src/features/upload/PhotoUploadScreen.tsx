import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bytesToBase64 } from '../../core/encoding/base64';
import { useViewModelState } from '../../core/state/useViewModelState';
import { format, t } from '../../shared/copy';
import { POST_TITLE_MAX } from '../../shared/constants';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { BackButton } from '../../shared/ui/BackButton';
import { ChalkakButton } from '../../shared/ui/Button';
import { Dialog, DialogButton } from '../../shared/ui/Dialog';
import { Icon } from '../../shared/ui/icons/Icon';
import { Skeleton } from '../../shared/ui/Skeleton';
import { TextField } from '../../shared/ui/TextField';
import { rotatedSize } from '../photo-edit/PhotoEditTransform';
import { PhotoEditScreen } from '../photo-edit/PhotoEditScreen';
import { encodePng } from '../../core/image/png';
import { localCopy, titleCounterText } from './localCopy';
import type { PhotoUploadViewModel, SelectedPhoto } from './PhotoUploadViewModel';
import { Text } from '../../shared/ui/Text';

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
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <BackButton
            testID="upload.close-button"
            accessibilityLabel={localCopy.closeA11y}
            onPress={() => viewModel.close()}
          />
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {t('upload.title')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.imageArea}>
            {state.photo ? (
              <PhotoPreview viewModel={viewModel} photo={state.photo} disabled={state.submitting} />
            ) : (
              <View style={styles.empty}>
                {topic.status === 'error' ? (
                  <>
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
                  </>
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
              </View>
            )}
            {state.photoLoading ? <Skeleton style={StyleSheet.absoluteFill} /> : null}
            <View style={styles.pickRow}>
              <PickButton
                testID="upload.album-button"
                icon="ic_photo_library"
                label={t('upload.album.a11y')}
                onPress={() => void viewModel.pickFromLibrary()}
                disabled={state.submitting}
              />
              {state.cameraAvailable ? (
                <PickButton
                  testID="upload.camera-button"
                  icon="ic_photo_camera"
                  label={t('upload.camera.a11y')}
                  onPress={() => void viewModel.capture()}
                  disabled={state.submitting}
                />
              ) : null}
            </View>
          </View>

          <View style={styles.titleBox}>
            <TextField
              testID="upload.title-input"
              value={state.title}
              onChangeText={(text) => viewModel.setTitle(text)}
              placeholder={t('upload.caption.placeholder')}
              editable={!state.submitting}
              returnKeyType="done"
              multiline
              numberOfLines={3}
              style={styles.titleInput}
              counterText={titleCounterText(state.titleLength, POST_TITLE_MAX)}
              counterTestID="upload.title-counter"
            />
          </View>

          {state.preparation === 'preparing' && state.photo ? (
            <View testID="upload.preparing-indicator" style={styles.status}>
              <ActivityIndicator size="small" color={colors.actionPrimary} />
              <Text style={styles.statusText}>{localCopy.preparing}</Text>
            </View>
          ) : null}
          {state.error ? (
            <Text testID="upload.error-message" style={styles.errorMessage}>
              {state.error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 0) + 26 }]}>
          <ChalkakButton
            testID="upload.submit-button"
            label={state.submitting ? t('upload.submitting') : t('upload.submit')}
            disabled={!state.canSubmit}
            busy={state.submitting}
            busyTestID="upload.submitting-indicator"
            onPress={() => void viewModel.submit()}
          />
        </View>
      </KeyboardAvoidingView>

      {state.permissionPrompt ? <PermissionDialog viewModel={viewModel} /> : null}
      {editor ? <PhotoEditScreen viewModel={editor} /> : null}
    </View>
  );
}

// 사진 선택 버튼(screens-b.md §5.1): 지름 42 원, 흰색 66%, 아이콘 22(원색), 옅은 그림자.
function PickButton(props: {
  testID: string;
  icon: 'ic_photo_library' | 'ic_photo_camera';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.pick, props.disabled && styles.pickDisabled]}
    >
      <Icon name={props.icon} size={22} />
    </Pressable>
  );
}

/** 확정한 사진: 편집 결과(자르기 비율)로 보이고, 누르면 편집기가 다시 열린다. 결과 그림을 만들 수 없으면 원본을 보인다. */
function PhotoPreview({
  viewModel,
  photo,
  disabled,
}: {
  viewModel: PhotoUploadViewModel;
  photo: SelectedPhoto;
  disabled: boolean;
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
      accessibilityHint="사진을 다시 편집해요"
      disabled={disabled}
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
    <Dialog
      titleTestID="upload.camera-permission-dialog"
      title={t('upload.permission.save')}
      message={localCopy.permissionBody}
      onRequestClose={() => viewModel.dismissPermissionPrompt()}
      stackedActions
      actions={
        <>
          <DialogButton
            testID="upload.camera-permission-settings-button"
            label={t('upload.permission.settings')}
            onPress={() => void viewModel.openPermissionSettings()}
          />
          <DialogButton
            testID="upload.camera-permission-shoot-button"
            tone="cancel"
            label={t('upload.no-save-capture')}
            onPress={() => void viewModel.captureWithoutSaving()}
          />
          <DialogButton
            testID="upload.camera-permission-cancel-button"
            tone="cancel"
            label={localCopy.permissionCancel}
            onPress={() => viewModel.dismissPermissionPrompt()}
          />
        </>
      }
    />
  );
}

// 원본 업로드(screens-b.md §5.1): 사진 영역 전체 폭 + inputBackground, 비어 있으면 1.216 비율 점선 테두리,
// 선택 버튼은 우상단 top 14 / right 11, 설명 입력 좌우 22 · 위 34, 하단 버튼 좌우 26 · 아래 26.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerTitle: { ...typography.headline, color: colors.textPrimary },
  headerSpacer: { width: 48 },
  content: { paddingTop: spacing.sm, paddingBottom: 104 },
  imageArea: { backgroundColor: colors.inputBackground, overflow: 'hidden' },
  empty: {
    aspectRatio: 1.216,
    margin: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.screenHorizontal,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  heading: { ...typography.subheadline, color: colors.textSecondary, textAlign: 'center' },
  guide: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...typography.subheadline, color: colors.textPrimary, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  retryText: { ...typography.body, color: colors.actionPrimary },
  preview: { width: '100%', alignSelf: 'center', backgroundColor: colors.inputBackground },
  previewImage: { width: '100%', height: '100%' },
  pickRow: {
    position: 'absolute',
    top: 14,
    right: 11,
    flexDirection: 'row',
    gap: 10,
  },
  pick: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.66)',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pickDisabled: { opacity: 0.5 },
  titleBox: { marginTop: 34, paddingHorizontal: 22 },
  titleInput: { ...typography.subheadline, minHeight: 66, textAlignVertical: 'top' },
  status: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  statusText: { ...typography.footnote, color: colors.textSecondary },
  errorMessage: {
    ...typography.footnote,
    marginTop: spacing.lg,
    paddingHorizontal: 22,
    color: colors.error,
  },
  footer: { paddingHorizontal: 26, paddingTop: spacing.sm },
});
