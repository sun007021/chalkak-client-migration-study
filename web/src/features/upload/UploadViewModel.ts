import { ViewModel } from '../../core/state/ViewModel';
import type { PresignedUploader } from '../../core/net/PresignedUploader';
import type { DateString } from '../../core/time/kst';
import type { PostChanges } from '../post/PostChanges';
import { IDENTITY_EDIT } from './editModel';
import type { PhotoEdit } from './editModel';
import type { PhotoPreparer } from './PhotoPreparer';
import type { TodayPostSource } from './UploadGate';
import type { UploadRepository } from './UploadRepository';
import type { UploadResultStore } from './UploadResult';

export type TopicLoad =
  | { status: 'loading' }
  | { status: 'ready'; id: string; title: string }
  /** message는 표시 문구: 연결 실패 upload.error.network, 그 밖(404, 5xx, 날짜 불일치) upload.error.topic-load */
  | { status: 'error'; message: string };

export interface SelectedPhoto {
  source: Blob;
  /** EXIF 방향을 반영한 보이는 크기(원본 비율 표시용, REQ-UPL-020). */
  width: number;
  height: number;
}

/** 편집기가 열려 있다. first: 방금 고른 사진(취소하면 선택 취소), again: 이미 확정한 사진을 다시 편집(취소하면 그대로). */
export interface EditorSession {
  kind: 'first' | 'again';
  source: Blob;
  initialEdit: PhotoEdit;
}

export type Preparation = 'idle' | 'preparing' | 'ready' | 'failed';

export interface UploadState {
  /** 게이트가 고정한 진입 시점의 topicDate. */
  topicDate: DateString;
  topic: TopicLoad;
  photo: SelectedPhoto | null;
  /** 확정한 편집값. 사진이 없으면 IDENTITY_EDIT. */
  edit: PhotoEdit;
  editor: EditorSession | null;
  /** 입력창 값(clampTitleInput 적용). */
  title: string;
  /** 앞뒤 공백을 뺀 제목의 code point 수(글자 수 표시). */
  titleCount: number;
  preparation: Preparation;
  /** 제출 중(준비 완료를 기다리는 동안 포함). 버튼 문구 "전시 중...", 입력·사진 잠금. */
  submitting: boolean;
  /** 사진이 있고 주제가 준비됐고 제출 중이 아니고 편집기가 닫혀 있다. 준비 상태(preparing/failed)와 무관하다(REQ-UPL-037). */
  canSubmit: boolean;
  /** upload.error-message에 보일 실패 문구. 새 선택·새 제출을 시작하면 지운다. */
  errorMessage: string | null;
}

export type UploadOutcome =
  /** 전시 완료(201 또는 복구 확인). 결과는 results에 담겼고 화면은 성공 화면으로 replace 이동한다. */
  | { kind: 'success' }
  /** 화면에 머문다(실패, 이미 진행 중, 제출 불가). */
  | { kind: 'stay' }
  /** 재인증이 필요하다. 로그인 화면은 세션 이벤트가 연다(문구 없음). */
  | { kind: 'login' }
  /** 화면 이탈(dispose)·계정 전환으로 결과를 버렸다. */
  | { kind: 'cancelled' };

export interface UploadViewModelDeps {
  /** 게이트가 고정한 topicDate. 자정이 지나도 이 값으로 주제를 받고 제출한다(REQ-UPL-008). */
  topicDate: DateString;
  repository: UploadRepository;
  /** 복구 확인·400 판정용 GET /posts/today. */
  today: TodayPostSource;
  preparer: PhotoPreparer;
  uploader: PresignedUploader;
  results: UploadResultStore;
  changes: PostChanges;
  /**
   * true: 사진을 고르거나 requestEdit()하면 편집기를 연다(W7b 이후). false(W7a 기본): 고른 즉시 IDENTITY_EDIT로 확정하고 준비를 시작한다.
   */
  editorEnabled: boolean;
}

/**
 * 업로드 화면 상태(REQ-UPL-008~064). 화면은 그리기만 하고 흐름은 모두 여기서 한다. 화면이 마운트될 때마다 새로 만들고 언마운트(dispose)에서 모든 요청을 취소한다.
 *
 * 문구는 upload.error-message(errorMessage)로 보인다(토스트 아님). 분류는 errorCode·HTTP 상태·호출 API로만 하고 서버 message로 가르지 않는다(D-02). 400의 "그 밖"만 서버 message를 그대로 보인다.
 *
 * - start(): `GET /topics?date={topicDate}` → topic.ready{id,title}. 404·5xx·응답 topicDate 불일치 → upload.error.topic-load, 연결 실패 → upload.error.network. 이미 시작했으면 무시.
 * - retryTopic(): 주제만 다시 받는다(사진·제목·준비 상태를 건드리지 않는다).
 * - selectPhoto(file): 제출 중이면 무시. 가장 최근 선택의 결과만 반영한다(늦은 이전 결과는 버림, REQ-UPL-019). preparer.inspect로 읽을 수 있는 이미지인지 확인 —
 *   실패(0바이트·손상·형식 미지원)면 편집기를 열지 않고 errorMessage upload.error.prepare, 이전 선택은 유지. 성공하면 새 선택이 이전 준비를 취소하고 errorMessage를 지운다.
 *   editorEnabled면 editor{kind:'first'}를 열고, 아니면 곧바로 confirmEdit(IDENTITY_EDIT)와 같다.
 * - confirmEdit(edit): first면 사진을 확정(photo, edit)하고 준비를 시작한다. again이면 sameEdit(edit, state.edit)일 때 편집기만 닫고 다시 준비하지 않으며(REQ-UPL-035),
 *   다르면 이전 준비를 취소하고 새로 준비한다. editor가 없으면 무시.
 * - cancelEdit(): first면 선택을 취소(photo·edit·준비는 이전 그대로), again이면 편집기만 닫는다. editor가 없으면 무시.
 * - requestEdit(): editorEnabled이고 photo가 있고 제출 중이 아니면 editor{kind:'again', initialEdit: state.edit}.
 * - setTitle(raw): 제출 중이면 무시. clampTitleInput(raw)를 title에 넣고 titleCount를 센다(REQ-UPL-022·024, 앞뒤 공백 제외 10 code point).
 * - 준비(백그라운드, REQ-UPL-025~036): 확정 즉시 preparer.prepare를 시작해 preparation을 preparing → ready | failed로 바꾼다. 새 선택·다른 편집값 확정·dispose는 이전 준비를 abort하고
 *   늦게 끝난 이전 결과가 새 상태를 덮지 않는다. 실패하면 사진·제목을 유지한 채 즉시 errorMessage(PrepareError.kind: network → upload.error.network, forbidden → upload.gate.banned, 그 밖 → upload.error.prepare).
 *   unauthorized는 문구 없음. 별도 재시도 버튼은 없다.
 * - submit(): canSubmit이 아니거나 이미 제출 중이면 {stay}(요청 추가 없음, 연타 1회). 순서(REQ-UPL-039~040):
 *   1) submitting=true, errorMessage 지움  2) 준비가 진행 중이면 끝날 때까지 기다리고, ready가 아니면(failed·idle) 처음부터 다시 준비
 *   3) preparer.ensureFresh(만료·maxBytes 재확인)  4) uploader.put({ url: policy.uploadUrl, body: file, contentType: policy.contentType, retry: true })  5) repository.createPost({ topicId, photoUploadId: policy.uploadId, title: titlePayload(title) })
 *   성공(201): results.set({ topicDate(진입 때 고정값), topicTitle, moderationStatus, photo }) 후 changes.publish({ type: 'created', ... }), {success}.
 *   실패 분류(모두 입력 유지, submitting=false):
 *   · 준비 실패(2, 3): PrepareError.kind로 위와 같은 문구, unauthorized → {login}
 *   · PUT: NetworkError(재시도 소진) → upload.error.network(정책 유지, 다음 제출은 같은 uploadId로 PUT부터), ApiError(S3 4xx/5xx)·ConfigError(안전하지 않은 URL) → upload.error.upload + 준비물 폐기(다음 제출은 정책 발급부터, REQ-UPL-059)
 *   · POST 403 → upload.gate.banned(재요청 없음)  · POST 401(갱신 실패·재인증) → {login}
 *   · POST NetworkError(타임아웃·끊김)·201인데 해석 불가(InvalidResponseError) → 재전송하지 않고 today.fetchTodayPost로 복구 확인(D-07): posted면 성공(상태는 today 응답의 moderationStatus), 아니면 upload.error.network
 *     (확인도 실패하면 upload.error.network). 재제출은 같은 uploadId(만료 전이면 같은 URL에 PUT부터).
 *   · POST 400 BUSINESS_ERROR → today 재조회로 판정(D-02): posted → upload.error.duplicate, no-open-topic 또는 topicDate가 진입 때와 다름 → upload.error.topic-changed,
 *     그 밖(not-posted, 같은 topicDate) → 서버 message 그대로 + 준비물 폐기(다음 제출은 정책 발급부터). 재조회가 실패하면 upload.error.create
 *   · POST 404·5xx·그 밖 → upload.error.create (404는 준비물도 폐기, 5xx는 유지). 자동 재시도 없음.
 *   · 취소(dispose) → {cancelled}: 성공 화면·results·changes 모두 없음.
 * - dispose(): 모든 요청(주제, 준비, PUT, POST, 복구 확인)을 abort하고 이후 상태를 바꾸지 않는다.
 */
export class UploadViewModel extends ViewModel<UploadState> {
  constructor(protected readonly deps: UploadViewModelDeps) {
    super({
      topicDate: deps.topicDate,
      topic: { status: 'loading' },
      photo: null,
      edit: IDENTITY_EDIT,
      editor: null,
      title: '',
      titleCount: 0,
      preparation: 'idle',
      submitting: false,
      canSubmit: false,
      errorMessage: null,
    });
  }

  start(): void {
    throw new Error('not implemented');
  }

  retryTopic(): void {
    throw new Error('not implemented');
  }

  selectPhoto(_file: Blob): Promise<void> {
    throw new Error('not implemented');
  }

  confirmEdit(_edit: PhotoEdit): void {
    throw new Error('not implemented');
  }

  cancelEdit(): void {
    throw new Error('not implemented');
  }

  requestEdit(): void {
    throw new Error('not implemented');
  }

  setTitle(_raw: string): void {
    throw new Error('not implemented');
  }

  submit(): Promise<UploadOutcome> {
    throw new Error('not implemented');
  }

  override dispose(): void {
    throw new Error('not implemented');
  }
}
