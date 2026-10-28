import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { GallerySaver } from '../../core/media/GallerySaver';
import type { ImagePicker } from '../../core/media/ImagePicker';
import type { MediaPermissions } from '../../core/media/MediaPermissions';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { TopicRepository } from '../../data/topic/TopicRepository';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { ImageEngine } from '../photo-edit/ImageEngine';
import type { Size } from '../photo-edit/ImageTypes';
import type { PhotoEdit } from '../photo-edit/PhotoEdit';
import type { PhotoEditViewModel } from '../photo-edit/PhotoEditViewModel';
import type { PostCreationNotifier } from './PostCreationNotifier';
import type { UploadNavigator } from './UploadNavigator';
import type { UploadPreparation } from './UploadPreparation';
import type { UploadSubmitter } from './UploadSubmitter';

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
  engine: Pick<ImageEngine, 'readBounds'>;
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
  constructor(private readonly deps: PhotoUploadViewModelDeps) {
    super(initialPhotoUploadState());
    void this.deps;
  }

  /** screen_view를 한 번 보내고 주제를 불러온다. 여러 번 불러도 한 번만 한다. */
  start(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 주제 불러오기 다시 시도(주제만 다시 받는다). */
  retryTopic(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 열려 있는 편집기(없으면 null). */
  get editor(): PhotoEditViewModel | null {
    throw new Error('not implemented');
  }

  pickFromLibrary(): Promise<void> {
    throw new Error('not implemented');
  }

  capture(): Promise<void> {
    throw new Error('not implemented');
  }

  /** iOS 권한 안내: "설정 열기". */
  openPermissionSettings(): Promise<void> {
    throw new Error('not implemented');
  }

  /** iOS 권한 안내: "저장 없이 촬영". */
  captureWithoutSaving(): Promise<void> {
    throw new Error('not implemented');
  }

  /** iOS 권한 안내: "취소". */
  dismissPermissionPrompt(): void {
    throw new Error('not implemented');
  }

  /** 선택한 사진을 탭: 저장된 편집값으로 편집기를 다시 연다. */
  editPhoto(): Promise<void> {
    throw new Error('not implemented');
  }

  setTitle(text: string): void {
    void text;
    throw new Error('not implemented');
  }

  /** "전시하기". 제출 중이면 무시한다. */
  submit(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 뒤로가기. */
  close(): void {
    throw new Error('not implemented');
  }

  override dispose(): void {
    throw new Error('not implemented');
  }
}

function initialPhotoUploadState(): PhotoUploadState {
  throw new Error('not implemented');
}
