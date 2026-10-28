import {
  AuthenticationRequiredError,
  CancelledError,
  NetworkError,
} from '../../core/http/ApiError';
import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { GallerySaver } from '../../core/media/GallerySaver';
import { CameraPermissionDeniedError, type ImagePicker } from '../../core/media/ImagePicker';
import type { MediaPermissions } from '../../core/media/MediaPermissions';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { TopicRepository } from '../../data/topic/TopicRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { ImageEngine } from '../photo-edit/ImageEngine';
import type { RgbaImage, Size } from '../photo-edit/ImageTypes';
import { FULL_CROP, type PhotoEdit } from '../photo-edit/PhotoEdit';
import { renderPixels } from '../photo-edit/PhotoPixelRenderer';
import type { PhotoEditViewModel } from '../photo-edit/PhotoEditViewModel';
import { localCopy } from './localCopy';
import { clampTitle, titleForRequest, titleLength } from './TitleInput';
import { mapUploadError } from './mapUploadError';
import type { PostCreationNotifier } from './PostCreationNotifier';
import type { UploadNavigator } from './UploadNavigator';
import { inputsEqual, type UploadPreparation } from './UploadPreparation';
import type { UploadSubmitter } from './UploadSubmitter';

/** 이 화면에서 로그인 이동은 한 번만 요청한다. */
const AUTH_KEY = 'upload';

export type TopicState =
  | { status: 'loading' }
  | { status: 'ready'; id: string; title: string }
  | { status: 'error'; message: string };

export type SelectedPhoto = { uri: string } & Size & { edit: PhotoEdit };

export type PhotoUploadState = {
  topic: TopicState;
  /** 편집을 확정한 사진. 처음 고른 사진은 편집기에서 완료하기 전까지 null이다. */
  photo: SelectedPhoto | null;
  /** 고른 사진을 읽는 중. */
  photoLoading: boolean;
  /** 편집기가 열려 있다(`editor`). */
  editing: boolean;
  /** 입력 그대로(앞뒤 공백 포함, 제거 후 10 code point 이내). */
  title: string;
  /** 제거 후 code point 수(`upload.title-counter`). */
  titleLength: number;
  preparation: 'idle' | 'preparing' | 'ready' | 'failed';
  submitting: boolean;
  /** 마지막 실패 문구(`upload.error-message`). */
  error: string | null;
  cameraAvailable: boolean;
  /** iOS 카메라 저장 권한 안내가 떠 있다. */
  permissionPrompt: boolean;
  /** 사진이 있고 제출 중이 아니며 주제가 있으면 true. 준비 중·준비 실패여도 true(REQ-UPL-037). */
  canSubmit: boolean;
};

export type EditorRequest = {
  sourceUri: string;
  sourceSize: Size;
  initialEdit: PhotoEdit | null;
  onDone: (edit: PhotoEdit) => void;
  onCancel: () => void;
};

export type PhotoUploadViewModelDeps = {
  /** 게이트가 고정해 넘긴 주제 날짜(REQ-UPL-008). */
  entry: { topicDate: KstDate };
  clock: Clock;
  platform: 'ios' | 'android';
  topics: Pick<TopicRepository, 'findByDate'>;
  picker: ImagePicker;
  gallery: GallerySaver;
  permissions: MediaPermissions;
  engine: Pick<ImageEngine, 'readBounds' | 'samplePixels'>;
  preparation: UploadPreparation;
  submitter: UploadSubmitter;
  createEditor: (request: EditorRequest) => PhotoEditViewModel;
  toast: ToastPresenter;
  analytics: AnalyticsTracker;
  navigator: Pick<UploadNavigator, 'showSuccess' | 'close'>;
  notifier: PostCreationNotifier;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

/**
 * 업로드 화면 상태(screen_view photo_upload). 사진 선택·촬영 -> 항상 편집기 -> 편집 확정 즉시 백그라운드 준비 -> "전시하기"로 제출.
 * 최신 선택만 반영하고(늦은 결과 버림), 제출은 한 번에 하나이며, 화면을 나가면 진행 중 작업을 취소하고 임시 파일을 지운다.
 */
export class PhotoUploadViewModel extends Observable<PhotoUploadState> {
  private started: Promise<void> | null = null;
  private editorVm: PhotoEditViewModel | null = null;
  /** 가장 최근 선택의 번호. 이전 선택의 늦은 결과를 버리는 데 쓴다(REQ-UPL-019). */
  private selection = 0;
  private submitAbort: AbortController | null = null;
  private gone = false;
  private completed = false;
  private readonly auth: AuthErrorPolicy;
  private readonly unsubscribePreparation: () => void;
  private lastPreparationError: unknown = null;

  constructor(private readonly deps: PhotoUploadViewModelDeps) {
    super(initialPhotoUploadState(deps));
    this.auth = new AuthErrorPolicy(deps.authFlow);
    this.unsubscribePreparation = deps.preparation.subscribe(() => this.onPreparationChanged());
  }

  /** screen_view를 한 번 보내고 주제를 불러온다. 여러 번 불러도 한 번만 한다. */
  start(): Promise<void> {
    if (!this.started) {
      this.started = (async () => {
        this.deps.analytics.screenView('photo_upload');
        this.patch({ cameraAvailable: this.deps.picker.cameraAvailable });
        await this.loadTopic();
      })();
    }
    return this.started;
  }

  /** 주제 불러오기 다시 시도(주제만 다시 받는다). */
  retryTopic(): Promise<void> {
    return this.loadTopic();
  }

  private async loadTopic(): Promise<void> {
    this.patch({ topic: { status: 'loading' } });
    try {
      const topic = await this.deps.topics.findByDate(this.deps.entry.topicDate);
      if (this.gone) return;
      this.patch({
        topic: topic
          ? { status: 'ready', id: topic.id, title: topic.title }
          : { status: 'error', message: t('upload.error.topic-load') },
      });
    } catch (error) {
      if (this.gone || error instanceof CancelledError) return;
      // 인증 오류는 로그인 이동(또는 세션 만료 이벤트)이 맡는다: 오류 상태를 만들지 않는다.
      if (this.auth.handle(error, AUTH_KEY)) return;
      this.patch({
        topic: {
          status: 'error',
          message:
            error instanceof NetworkError
              ? t('upload.error.network')
              : t('upload.error.topic-load'),
        },
      });
    }
  }

  /** 열려 있는 편집기(없으면 null). */
  get editor(): PhotoEditViewModel | null {
    return this.editorVm;
  }

  async pickFromLibrary(): Promise<void> {
    if (!this.canChangePhoto()) return;
    const token = ++this.selection;
    try {
      const result = await this.deps.picker.pickFromLibrary();
      if (token !== this.selection || result.kind === 'cancelled') return;
      await this.openForNewPhoto(token, result.image.uri);
    } catch (error) {
      this.pickFailed(token, error);
    }
  }

  async capture(): Promise<void> {
    if (!this.canChangePhoto()) return;
    if (this.deps.platform === 'ios') {
      const permission = await this.deps.permissions.requestPhotoAddPermission();
      if (this.gone) return;
      if (permission === 'denied') {
        this.patch({ permissionPrompt: true });
        return;
      }
    }
    await this.captureAndOpen(true);
  }

  /** iOS 권한 안내: "설정 열기". */
  async openPermissionSettings(): Promise<void> {
    this.patch({ permissionPrompt: false });
    await this.deps.permissions.openSettings();
  }

  /** iOS 권한 안내: "저장 없이 촬영". */
  async captureWithoutSaving(): Promise<void> {
    this.patch({ permissionPrompt: false });
    await this.captureAndOpen(false);
  }

  /** iOS 권한 안내: "취소". */
  dismissPermissionPrompt(): void {
    this.patch({ permissionPrompt: false });
  }

  private async captureAndOpen(save: boolean): Promise<void> {
    if (!this.canChangePhoto()) return;
    const token = ++this.selection;
    try {
      const result = await this.deps.picker.capture();
      if (token !== this.selection || result.kind === 'cancelled') return;
      // 저장은 기다리지 않는다: 실패해도 사진은 그대로 쓰고, 화면을 나간 뒤에 끝나도 토스트로 알린다(REQ-UPL-015·016).
      if (save) void this.saveToGallery(result.image.uri);
      await this.openForNewPhoto(token, result.image.uri);
    } catch (error) {
      this.pickFailed(token, error);
    }
  }

  private async saveToGallery(uri: string): Promise<void> {
    const stamp = this.deps.clock
      .now()
      .toISOString()
      .replace(/[-:.TZ]/g, '');
    try {
      const result = await this.deps.gallery.save({ uri, fileName: `chalkak-photo-${stamp}.jpg` });
      if (result !== 'saved') this.deps.toast.show(t('upload.camera.save-failed'));
    } catch {
      this.deps.toast.show(t('upload.camera.save-failed'));
    }
  }

  private canChangePhoto(): boolean {
    return !this.gone && !this.completed && !this.getSnapshot().submitting;
  }

  private pickFailed(token: number, error?: unknown): void {
    if (this.gone || token !== this.selection) return;
    this.patch({
      photoLoading: false,
      error:
        error instanceof CameraPermissionDeniedError
          ? localCopy.cameraPermissionDenied
          : t('upload.error.prepare'),
    });
  }

  /** 고른 사진의 표시 크기(EXIF 반영)를 읽고 편집기를 연다. 읽을 수 없으면 편집기를 열지 않는다(REQ-UPL-018). */
  private async openForNewPhoto(token: number, uri: string): Promise<void> {
    this.patch({ photoLoading: true, error: null });
    let size: Size;
    try {
      size = await this.deps.engine.readBounds(uri);
    } catch {
      this.pickFailed(token);
      return;
    }
    if (this.gone || token !== this.selection) return;
    this.patch({ photoLoading: false });
    this.openEditor({ sourceUri: uri, sourceSize: size, initialEdit: null });
  }

  /**
   * 확정한 사진의 미리보기 픽셀: 원본의 작은 표본에 저장된 편집값을 그대로 적용한다(제출 때의 결과와 같은 순서).
   * 표본을 만들 수 없으면 null이고 화면은 원본을 그대로 보인다. 사진이 바뀌었거나 화면을 나갔으면 null.
   */
  async previewPixels(maxLongEdge = 640): Promise<RgbaImage | null> {
    const photo = this.getSnapshot().photo;
    if (!photo || this.gone) return null;
    try {
      const sample = await this.deps.engine.samplePixels({
        sourceUri: photo.uri,
        sourceSize: { width: photo.width, height: photo.height },
        quarterTurns: 0,
        crop: { ...FULL_CROP },
        maxLongEdge,
      });
      if (!sample || this.gone || this.getSnapshot().photo !== photo) return null;
      return renderPixels(sample, photo.edit);
    } catch {
      return null;
    }
  }

  /** 선택한 사진을 탭: 저장된 편집값으로 편집기를 다시 연다. */
  async editPhoto(): Promise<void> {
    const { photo, editing } = this.getSnapshot();
    if (!photo || editing || !this.canChangePhoto()) return;
    this.openEditor({
      sourceUri: photo.uri,
      sourceSize: { width: photo.width, height: photo.height },
      initialEdit: photo.edit,
    });
  }

  private openEditor(request: Pick<EditorRequest, 'sourceUri' | 'sourceSize' | 'initialEdit'>) {
    this.editorVm?.dispose();
    const editor = this.deps.createEditor({
      ...request,
      onDone: (edit) => this.onEditDone(editor, request, edit),
      onCancel: () => this.onEditCancelled(editor),
    });
    this.editorVm = editor;
    this.patch({ editing: true });
  }

  private onEditDone(
    editor: PhotoEditViewModel,
    request: Pick<EditorRequest, 'sourceUri' | 'sourceSize'>,
    edit: PhotoEdit,
  ): void {
    if (this.gone || this.editorVm !== editor) return;
    this.closeEditor();
    this.patch({
      photo: { uri: request.sourceUri, ...request.sourceSize, edit },
      editing: false,
      error: null,
    });
    // 편집을 마친 즉시 백그라운드 준비를 시작한다(REQ-UPL-025). 같은 입력이면 다시 하지 않는다(REQ-UPL-035).
    const next = { sourceUri: request.sourceUri, edit };
    const previous = this.deps.preparation.currentInput();
    // 입력이 바뀌면 이전 사진의 미확정 업로드(PUT 뒤 POST 실패)를 버린다.
    if (!previous || !inputsEqual(previous, next)) this.deps.submitter.reset();
    this.deps.preparation.start(next);
  }

  private onEditCancelled(editor: PhotoEditViewModel): void {
    if (this.gone || this.editorVm !== editor) return;
    this.closeEditor();
    this.patch({ editing: false });
  }

  private closeEditor(): void {
    const editor = this.editorVm;
    this.editorVm = null;
    editor?.dispose();
  }

  setTitle(text: string): void {
    if (this.getSnapshot().submitting || this.completed) return;
    const title = clampTitle(text);
    this.patch({ title, titleLength: titleLength(title) });
  }

  /** "전시하기". 제출 중이면 무시한다. */
  async submit(): Promise<void> {
    const state = this.getSnapshot();
    if (this.gone || this.completed || state.submitting || !state.photo) return;
    if (state.topic.status !== 'ready' || state.editing) return;
    const topic = state.topic;
    const controller = new AbortController();
    this.submitAbort = controller;
    this.patch({ submitting: true, error: null });
    const outcome = await this.deps.submitter.submit(
      {
        topicId: topic.id,
        topicDate: this.deps.entry.topicDate,
        title: titleForRequest(state.title),
      },
      controller.signal,
    );
    this.submitAbort = null;

    if (outcome.kind === 'success') {
      this.completed = true;
      // 요청이 서버에 도달했다면 화면이 없어도 알린다(홈 갱신).
      this.deps.notifier.postCreated({
        postId: outcome.postId,
        topicDate: this.deps.entry.topicDate,
        moderationStatus: outcome.moderationStatus,
      });
      if (this.gone) return;
      this.deps.preparation.cancel();
      this.patch({ submitting: false, photo: null, error: null });
      this.deps.navigator.showSuccess({
        topicTitle: topic.title,
        topicDate: this.deps.entry.topicDate,
        moderationStatus: outcome.moderationStatus,
      });
      return;
    }
    if (this.gone) return;
    switch (outcome.kind) {
      case 'failed':
        this.patch({ submitting: false, error: outcome.message });
        break;
      case 'login-required':
        this.patch({ submitting: false });
        this.auth.handle(new AuthenticationRequiredError('401'), AUTH_KEY);
        break;
      case 'session-expired':
        this.discardPhoto();
        break;
      case 'cancelled':
        this.patch({ submitting: false });
        break;
    }
  }

  /** 세션이 만료됐다: 사진·정책·임시 파일을 버린다. 로그인 이동은 session-expired 이벤트가 맡는다. */
  private discardPhoto(): void {
    this.deps.preparation.cancel();
    this.deps.submitter.reset();
    this.patch({ submitting: false, photo: null, error: null, preparation: 'idle' });
  }

  private onPreparationChanged(): void {
    if (this.gone) return;
    const prep = this.deps.preparation.getSnapshot();
    const label: PhotoUploadState['preparation'] =
      prep.phase === 'issuing' || prep.phase === 'encoding'
        ? 'preparing'
        : prep.phase === 'failed'
          ? 'failed'
          : prep.phase === 'ready'
            ? 'ready'
            : 'idle';
    if (label !== this.getSnapshot().preparation) this.patch({ preparation: label });
    if (prep.phase !== 'failed') {
      this.lastPreparationError = null;
      return;
    }
    // 제출 중의 실패는 제출 결과가 처리한다.
    if (this.getSnapshot().submitting || this.lastPreparationError === prep.error) return;
    this.lastPreparationError = prep.error;
    const failure = mapUploadError('policy', prep.error);
    if (failure.kind === 'message') this.patch({ error: failure.message });
    else if (failure.kind === 'login-required') this.auth.handle(prep.error, AUTH_KEY);
    else if (failure.kind === 'session-expired') this.discardPhoto();
  }

  /** 뒤로가기. */
  close(): void {
    this.deps.navigator.close();
  }

  override dispose(): void {
    if (this.gone) return;
    this.gone = true;
    this.selection += 1;
    this.submitAbort?.abort();
    this.unsubscribePreparation();
    this.closeEditor();
    this.deps.preparation.cancel();
    this.deps.submitter.reset();
    super.dispose();
  }

  private patch(change: Partial<PhotoUploadState>): void {
    const next = { ...this.getSnapshot(), ...change };
    this.setState({
      ...next,
      canSubmit: next.photo !== null && !next.submitting && next.topic.status === 'ready',
    });
  }
}

function initialPhotoUploadState(deps: PhotoUploadViewModelDeps): PhotoUploadState {
  return {
    topic: { status: 'loading' },
    photo: null,
    photoLoading: false,
    editing: false,
    title: '',
    titleLength: 0,
    preparation: 'idle',
    submitting: false,
    error: null,
    cameraAvailable: deps.picker.cameraAvailable,
    permissionPrompt: false,
    canSubmit: false,
  };
}
