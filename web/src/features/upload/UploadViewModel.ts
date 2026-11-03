import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import { ApiError, InvalidResponseError, isCancellation, NetworkError, SessionChangedError } from '../../core/net/errors';
import type { PresignedUploader } from '../../core/net/PresignedUploader';
import { RequestSlots } from '../../core/state/RequestSlots';
import { ViewModel } from '../../core/state/ViewModel';
import type { DateString } from '../../core/time/kst';
import { clampTitleInput, countCodePoints, titlePayload } from '../feed/titleInput';
import type { PostChanges } from '../post/PostChanges';
import { IDENTITY_EDIT, sameEdit } from './editModel';
import type { PhotoEdit } from './editModel';
import { PrepareError } from './PhotoPreparer';
import type { PhotoPreparer, PreparedUpload } from './PhotoPreparer';
import type { TodayPostSource } from './UploadGate';
import type { CreatedModerationStatus, UploadRepository } from './UploadRepository';
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
type PrepOutcome = { kind: 'ready'; prepared: PreparedUpload } | { kind: 'failed'; failure: PrepareError } | { kind: 'stale' };

interface PrepTask {
  id: number;
  controller: AbortController;
  /** 절대 거절하지 않는다. 상태 반영은 끝낸 뒤에 돌려준다. */
  promise: Promise<PrepOutcome>;
}

const PREPARE_MESSAGES: Readonly<Record<PrepareError['kind'], CopyKey | null>> = {
  network: 'upload.error.network',
  forbidden: 'upload.gate.banned',
  unauthorized: null,
  prepare: 'upload.error.prepare',
};

export class UploadViewModel extends ViewModel<UploadState> {
  private readonly slots = new RequestSlots<'topic' | 'select'>(() => this.closed);
  private closed = false;
  private started = false;
  private completed = false;
  /** first 편집기가 열려 있는 동안 고른 사진의 보이는 크기. */
  private pendingSize: { width: number; height: number } | null = null;
  /** 진행 중인 준비 작업(끝나면 null). 새 선택·다른 편집값·dispose가 abort하고 무효로 만든다. */
  private prep: PrepTask | null = null;
  private prepGeneration = 0;
  /** 준비가 끝난 업로드 준비물(preparation === 'ready'일 때만 있다). */
  private prepared: PreparedUpload | null = null;
  private submitController: AbortController | null = null;

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
    if (this.started || this.closed) return;
    this.started = true;
    void this.loadTopic();
  }

  retryTopic(): void {
    if (this.closed || this.state.topic.status !== 'error') return;
    void this.loadTopic();
  }

  async selectPhoto(file: Blob): Promise<void> {
    if (this.closed || this.state.submitting) return;
    const pass = this.slots.begin('select');
    try {
      const size = await this.deps.preparer.inspect(file, pass.signal);
      if (!pass.isCurrent()) return;
      this.patch({ errorMessage: null });
      if (this.deps.editorEnabled) {
        this.pendingSize = size;
        this.patch({ editor: { kind: 'first', source: file, initialEdit: IDENTITY_EDIT } });
        return;
      }
      this.commitPhoto(file, size, IDENTITY_EDIT);
    } catch (error) {
      if (!pass.isCurrent() || isCancellation(error)) return;
      this.patch({ errorMessage: t('upload.error.prepare') });
    }
  }

  confirmEdit(edit: PhotoEdit): void {
    const editor = this.state.editor;
    if (this.closed || !editor || this.state.submitting) return;
    if (editor.kind === 'again') {
      this.patch({ editor: null });
      if (sameEdit(edit, this.state.edit)) return;
      this.patch({ edit });
      this.startPrepare();
      return;
    }
    const size = this.pendingSize;
    this.pendingSize = null;
    if (!size) return;
    this.commitPhoto(editor.source, size, edit);
  }

  cancelEdit(): void {
    if (this.closed || !this.state.editor) return;
    this.pendingSize = null;
    this.patch({ editor: null });
  }

  requestEdit(): void {
    const { photo, editor, submitting, edit } = this.state;
    if (this.closed || !this.deps.editorEnabled || !photo || editor || submitting) return;
    this.patch({ editor: { kind: 'again', source: photo.source, initialEdit: edit } });
  }

  setTitle(raw: string): void {
    if (this.closed || this.state.submitting) return;
    const title = clampTitleInput(raw);
    this.patch({ title, titleCount: countCodePoints(title.trim()) });
  }

  async submit(): Promise<UploadOutcome> {
    if (this.closed) return { kind: 'cancelled' };
    if (!this.state.canSubmit || this.state.submitting) return { kind: 'stay' };
    const controller = new AbortController();
    this.submitController = controller;
    this.patch({ submitting: true, errorMessage: null });
    try {
      return await this.runSubmit(controller.signal);
    } finally {
      if (this.submitController === controller) this.submitController = null;
      this.patch({ submitting: false });
    }
  }

  override dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.slots.cancelAll();
    this.cancelPrep();
    this.submitController?.abort();
    super.dispose();
  }

  /** 상태를 바꾸고 파생값(canSubmit)을 다시 계산한다. 화면을 떠난 뒤에는 아무것도 바꾸지 않는다. */
  private patch(change: Partial<UploadState>): void {
    if (this.closed) return;
    const next = { ...this.state, ...change };
    this.setState({ ...change, canSubmit: next.photo !== null && next.topic.status === 'ready' && !next.submitting && next.editor === null && !this.completed });
  }

  private async loadTopic(): Promise<void> {
    const pass = this.slots.begin('topic');
    this.patch({ topic: { status: 'loading' } });
    try {
      const topic = await this.deps.repository.fetchTopic(this.deps.topicDate, pass.signal);
      if (!pass.isCurrent()) return;
      this.patch({ topic: { status: 'ready', id: topic.id, title: topic.title } });
    } catch (error) {
      if (!pass.isCurrent() || isCancellation(error)) return;
      this.patch({ topic: { status: 'error', message: t(error instanceof NetworkError ? 'upload.error.network' : 'upload.error.topic-load') } });
    }
  }

  /** 사진을 확정하고 새 준비를 시작한다(이전 준비는 취소). */
  private commitPhoto(source: Blob, size: { width: number; height: number }, edit: PhotoEdit): void {
    this.patch({ photo: { source, width: size.width, height: size.height }, edit, editor: null });
    this.startPrepare();
  }

  private cancelPrep(): void {
    this.prep?.controller.abort();
    this.prep = null;
    this.prepGeneration += 1;
  }

  private startPrepare(): PrepTask | null {
    const photo = this.state.photo;
    if (this.closed || !photo) return null;
    this.cancelPrep();
    this.prepared = null;
    const id = this.prepGeneration;
    const controller = new AbortController();
    const edit = this.state.edit;
    this.patch({ preparation: 'preparing' });
    const isCurrent = () => !this.closed && this.prepGeneration === id;
    const promise = (async (): Promise<PrepOutcome> => {
      try {
        const prepared = await this.deps.preparer.prepare({ photo: photo.source, edit }, controller.signal);
        if (!isCurrent()) return { kind: 'stale' };
        this.prepared = prepared;
        this.prep = null;
        this.patch({ preparation: 'ready' });
        return { kind: 'ready', prepared };
      } catch (error) {
        if (!isCurrent() || isCancellation(error)) return { kind: 'stale' };
        const failure = error instanceof PrepareError ? error : new PrepareError('prepare', error);
        this.prep = null;
        this.patch({ preparation: 'failed' });
        this.showPrepareFailure(failure);
        return { kind: 'failed', failure };
      }
    })();
    const task: PrepTask = { id, controller, promise };
    this.prep = task;
    return task;
  }

  private showPrepareFailure(failure: PrepareError): void {
    const key = PREPARE_MESSAGES[failure.kind];
    if (key) this.patch({ errorMessage: t(key) });
  }

  /** 준비물을 버린다: 다음 제출은 정책 발급부터 다시 한다. */
  private discardPrepared(): void {
    this.prepared = null;
    this.patch({ preparation: 'idle' });
  }

  private async runSubmit(signal: AbortSignal): Promise<UploadOutcome> {
    const { photo, edit, topic, title } = this.state;
    if (!photo || topic.status !== 'ready') return { kind: 'stay' };

    // 2) 준비: 진행 중이면 기다리고, ready가 아니면 처음부터 다시 한다.
    let prepared = this.prepared;
    const task = this.prep ?? (prepared ? null : this.startPrepare());
    if (task) {
      const outcome = await task.promise;
      if (this.closed) return { kind: 'cancelled' };
      if (outcome.kind === 'failed') return outcome.failure.kind === 'unauthorized' ? { kind: 'login' } : { kind: 'stay' };
      if (outcome.kind === 'stale') return { kind: 'stay' };
      prepared = outcome.prepared;
    }
    if (!prepared) return { kind: 'stay' };

    // 3) 정책 수명·maxBytes 재확인
    try {
      const fresh = await this.deps.preparer.ensureFresh(prepared, { photo: photo.source, edit }, signal);
      if (this.closed) return { kind: 'cancelled' };
      if (fresh !== prepared) this.prepared = fresh;
      prepared = fresh;
    } catch (error) {
      if (this.closed || isCancellation(error)) return { kind: 'cancelled' };
      const failure = error instanceof PrepareError ? error : new PrepareError('prepare', error);
      this.showPrepareFailure(failure);
      return failure.kind === 'unauthorized' ? { kind: 'login' } : { kind: 'stay' };
    }

    // 4) S3 PUT
    try {
      await this.deps.uploader.put({ url: prepared.policy.uploadUrl, body: prepared.file, contentType: prepared.policy.contentType, retry: true, signal });
    } catch (error) {
      if (this.closed || isCancellation(error)) return { kind: 'cancelled' };
      if (error instanceof NetworkError) {
        this.patch({ errorMessage: t('upload.error.network') });
      } else {
        this.patch({ errorMessage: t('upload.error.upload') });
        this.discardPrepared();
      }
      return { kind: 'stay' };
    }
    if (this.closed) return { kind: 'cancelled' };

    // 5) 게시물 생성(자동 재시도 없음)
    try {
      const created = await this.deps.repository.createPost({ topicId: topic.id, photoUploadId: prepared.policy.uploadId, title: titlePayload(title) }, signal);
      return this.succeed(created.postId, created.moderationStatus, topic.title, prepared.file);
    } catch (error) {
      if (this.closed || isCancellation(error) || error instanceof SessionChangedError) return { kind: 'cancelled' };
      if (error instanceof NetworkError || error instanceof InvalidResponseError) return this.recover(topic.title, prepared.file, signal);
      if (error instanceof ApiError) return this.rejectedByServer(error, signal);
      this.patch({ errorMessage: t('upload.error.create') });
      return { kind: 'stay' };
    }
  }

  private succeed(postId: string, moderationStatus: CreatedModerationStatus | 'APPROVED', topicTitle: string, photo: Blob): UploadOutcome {
    if (this.closed) return { kind: 'cancelled' };
    this.completed = true;
    this.prepared = null;
    this.deps.results.set({ topicDate: this.deps.topicDate, topicTitle, moderationStatus, photo });
    this.deps.changes.publish({ type: 'created', postId, topicDate: this.deps.topicDate, moderationStatus });
    this.patch({});
    return { kind: 'success' };
  }

  /** 응답을 알 수 없을 때(D-07): 재전송하지 않고 GET /posts/today로 서버가 만들었는지 확인한다. */
  private async recover(topicTitle: string, photo: Blob, signal: AbortSignal): Promise<UploadOutcome> {
    try {
      const today = await this.deps.today.fetchTodayPost(signal);
      if (this.closed) return { kind: 'cancelled' };
      if (today.kind === 'posted' && today.topicDate === this.deps.topicDate) return this.succeed(today.postId, today.moderationStatus, topicTitle, photo);
    } catch (error) {
      if (this.closed || isCancellation(error)) return { kind: 'cancelled' };
      if (error instanceof ApiError && error.status === 401) return { kind: 'login' };
    }
    this.patch({ errorMessage: t('upload.error.network') });
    return { kind: 'stay' };
  }

  private async rejectedByServer(error: ApiError, signal: AbortSignal): Promise<UploadOutcome> {
    if (error.status === 401) return { kind: 'login' };
    if (error.status === 403) {
      this.patch({ errorMessage: t('upload.gate.banned') });
      return { kind: 'stay' };
    }
    if (error.status === 404) {
      this.patch({ errorMessage: t('upload.error.create') });
      this.discardPrepared();
      return { kind: 'stay' };
    }
    if (error.status !== 400 || error.errorCode === null) {
      this.patch({ errorMessage: t('upload.error.create') });
      return { kind: 'stay' };
    }
    // 400: 서버 message로 가르지 않고 today를 다시 조회해 판정한다(D-02).
    try {
      const today = await this.deps.today.fetchTodayPost(signal);
      if (this.closed) return { kind: 'cancelled' };
      if (today.kind === 'banned') {
        this.patch({ errorMessage: t('upload.gate.banned') });
      } else if (today.kind === 'posted') {
        this.patch({ errorMessage: t(today.topicDate === this.deps.topicDate ? 'upload.error.duplicate' : 'upload.error.topic-changed') });
      } else if (today.kind === 'no-open-topic' || today.topicDate !== this.deps.topicDate) {
        this.patch({ errorMessage: t('upload.error.topic-changed') });
      } else {
        this.patch({ errorMessage: error.message !== '' ? error.message : t('upload.error.create') });
        this.discardPrepared();
      }
    } catch (checkError) {
      if (this.closed || isCancellation(checkError)) return { kind: 'cancelled' };
      if (checkError instanceof ApiError && checkError.status === 401) return { kind: 'login' };
      this.patch({ errorMessage: t('upload.error.create') });
    }
    return { kind: 'stay' };
  }
}
