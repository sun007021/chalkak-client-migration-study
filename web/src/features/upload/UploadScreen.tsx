import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useContainer } from "../../app/AppContext";
import { ROUTES } from "../../app/paths";
import { POST_TITLE_MAX } from "../../constants";
import { t } from "../../copy/ko";
import { webOnlyCopy } from "../../copy/webOnly";
import { useScreenView } from "../../core/analytics/useScreenView";
import { useOwnedViewModel } from "../../core/state/useOwnedViewModel";
import { useViewModel } from "../../core/state/useViewModel";
import { ErrorState } from "../../core/ui/StateViews";
import { planUploadClose, readUploadRouteState } from "./uploadNavigation";
import type { UploadViewModel } from "./UploadViewModel";

/**
 * 업로드 화면(`/upload`, screen_view `photo_upload`). 회원 전용(게스트가 URL로 오면 홈으로 replace + nav.guest.upload 토스트).
 * location.state가 readUploadRouteState로 읽히지 않으면 홈으로 replace(요청·screen_view 없음).
 * data-testid: upload.root, upload.close-button, upload.topic-title, upload.guide-text, upload.photo-preview, upload.album-button,
 * upload.camera-button(container.cameraCapture.supported()일 때만), upload.title-input, upload.title-counter, upload.submit-button,
 * upload.preparing-indicator, upload.submitting-indicator, upload.error-message, upload.error-state, upload.retry-button.
 * 앨범/카메라 버튼은 `<label data-testid=…>` 안의 `<input type="file" accept="image/*">`(카메라는 capture 속성도)이고 단일 선택이다.
 * 편집기는 container.photoEditor가 있을 때 vm.state.editor가 열려 있는 동안 그 컴포넌트를 그린다.
 */
export function UploadScreen(): ReactNode {
  const route = readUploadRouteState(useLocation().state);
  return route ? (
    <UploadScreenBody topicDate={route.topicDate} />
  ) : (
    <Navigate to={ROUTES.home} replace />
  );
}

function UploadScreenBody({ topicDate }: { topicDate: string }): ReactNode {
  const container = useContainer();
  const create = useCallback(
    () => container.createUploadViewModel(topicDate),
    [container, topicDate],
  );
  const vm = useOwnedViewModel(create);
  return vm ? <UploadView vm={vm} /> : null;
}

const rootStyle: CSSProperties = {
  minHeight: "100dvh",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 16,
};
const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const previewStyle: CSSProperties = {
  width: "100%",
  maxHeight: "55dvh",
  display: "block",
  padding: 0,
  border: "none",
  borderRadius: 12,
  overflow: "hidden",
  background: "#f2f2f2",
};
const pickersStyle: CSSProperties = { display: "flex", gap: 8 };
const pickerStyle: CSSProperties = {
  flex: 1,
  minHeight: 64,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed currentColor",
  borderRadius: 12,
  cursor: "pointer",
};
const hiddenInputStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  overflow: "hidden",
  pointerEvents: "none",
};
const editorOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 30,
  background: "Canvas",
  overflow: "auto",
};

function UploadView({ vm }: { vm: UploadViewModel }): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  const location = useLocation();
  const Editor = container.photoEditor;
  useScreenView("photo_upload");
  const state = useViewModel(vm);
  useEffect(() => vm.start(), [vm]);

  const source = state.photo?.source ?? null;
  // URL은 만든 사진과 한 상태로 둔다: 사진이 바뀐 첫 렌더에서 이미 놓아 버린 이전 URL을 그리지 않는다.
  const [preview, setPreview] = useState<{ source: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!source) {
      // 사진이 없으면 미리보기 URL도 없다(외부 자원을 선택 수명에 묶는 의도된 setState).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return undefined;
    }
    const url = container.blobUrls.create(source);
    setPreview({ source, url });
    return () => container.blobUrls.revoke(url);
  }, [container, source]);
  const previewUrl = preview && preview.source === source ? preview.url : null;

  // 제출이 실패하면 스크린 리더와 키보드 사용자가 문구를 놓치지 않도록 초점을 오류 문구로 옮긴다.
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [failureTick, setFailureTick] = useState(0);
  useEffect(() => {
    if (failureTick > 0) errorRef.current?.focus();
  }, [failureTick]);

  const close = () => {
    const plan = planUploadClose(location);
    if (plan.kind === "back") void navigate(-1);
    else void navigate(plan.to, { replace: true });
  };
  const submit = () => {
    void vm.submit().then((outcome) => {
      if (outcome.kind === "success") void navigate(ROUTES.uploadSuccess, { replace: true });
      else if (outcome.kind === "stay") setFailureTick((n) => n + 1);
    });
  };
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void vm.selectPhoto(file);
  };

  const { topic, photo, editor } = state;
  return (
    <div data-testid="upload.root" style={rootStyle}>
      <div style={headerStyle}>
        <button
          type="button"
          data-testid="upload.close-button"
          aria-label={t("common.close")}
          style={{ minWidth: 44, minHeight: 44 }}
          onClick={close}
        >
          ✕
        </button>
        <h1 style={{ margin: 0, fontSize: 18 }}>{t("upload.title")}</h1>
      </div>

      {topic.status === "ready" && (
        <div>
          <h2
            data-testid="upload.topic-title"
            style={{ margin: 0, fontSize: 20 }}
          >
            {t("upload.heading", { 주제: topic.title })}
          </h2>
          <p data-testid="upload.guide-text" style={{ margin: "4px 0 0" }}>
            {t("upload.subheading")}
          </p>
        </div>
      )}
      {topic.status === "error" && (
        <ErrorState
          screenId="upload"
          message={topic.message}
          onRetry={() => vm.retryTopic()}
        />
      )}

      {photo && previewUrl && (
        <PhotoPreview
          aspect={`${photo.width} / ${photo.height}`}
          url={previewUrl}
          editable={Editor !== null && !state.submitting}
          onPress={() => vm.requestEdit()}
        />
      )}
      <div style={{ ...pickersStyle, ...(photo ? { minHeight: 0 } : {}) }}>
        <PickerLabel testId="upload.album-button" icon="🖼">
          <input
            type="file"
            accept="image/*"
            aria-label={webOnlyCopy["upload.album.a11y"]}
            disabled={state.submitting}
            style={hiddenInputStyle}
            onChange={pick}
          />
        </PickerLabel>
        {container.cameraCapture.supported() && (
          <PickerLabel testId="upload.camera-button" icon="📷">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label={webOnlyCopy["upload.camera.a11y"]}
              disabled={state.submitting}
              style={hiddenInputStyle}
              onChange={pick}
            />
          </PickerLabel>
        )}
      </div>

      <div>
        <textarea
          data-testid="upload.title-input"
          rows={2}
          value={state.title}
          placeholder={t("upload.caption.placeholder")}
          disabled={state.submitting}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 12,
            borderRadius: 8,
            font: "inherit",
          }}
          onChange={(event) => vm.setTitle(event.target.value)}
        />
        <div data-testid="upload.title-counter" style={{ textAlign: "right" }}>
          {state.titleCount}/{POST_TITLE_MAX}
        </div>
      </div>

      {state.preparation === "preparing" && !state.submitting && (
        <Indicator testId="upload.preparing-indicator" />
      )}
      {state.submitting && <Indicator testId="upload.submitting-indicator" />}
      {state.errorMessage && (
        <p
          ref={errorRef}
          tabIndex={-1}
          data-testid="upload.error-message"
          role="alert"
          style={{ margin: 0 }}
        >
          {state.errorMessage}
        </p>
      )}

      <button
        type="button"
        data-testid="upload.submit-button"
        disabled={!state.canSubmit}
        style={{ minHeight: 48, marginTop: "auto" }}
        onClick={submit}
      >
        {state.submitting ? t("upload.submitting") : t("upload.submit")}
      </button>

      {Editor && editor && (
        <div style={editorOverlayStyle}>
          <Editor
            source={editor.source}
            initialEdit={editor.initialEdit}
            onConfirm={(edit) => vm.confirmEdit(edit)}
            onCancel={() => vm.cancelEdit()}
          />
        </div>
      )}
    </div>
  );
}

/** 숨긴 file input의 라벨. input에 초점이 오면(:focus-within에 해당) 라벨에 윤곽선을 그린다. */
function PickerLabel({
  testId,
  icon,
  children,
}: {
  testId: string;
  icon: string;
  children: ReactNode;
}): ReactNode {
  const [focused, setFocused] = useState(false);
  return (
    <label
      data-testid={testId}
      style={
        focused
          ? { ...pickerStyle, outline: "3px solid #1a73e8", outlineOffset: 2 }
          : pickerStyle
      }
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </label>
  );
}

function PhotoPreview({
  aspect,
  url,
  editable,
  onPress,
}: {
  aspect: string;
  url: string;
  editable: boolean;
  onPress: () => void;
}): ReactNode {
  const style: CSSProperties = { ...previewStyle, aspectRatio: aspect };
  const image = (
    <img
      src={url}
      alt={editable ? "" : webOnlyCopy["upload.preview.alt"]}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
    />
  );
  return editable ? (
    <button
      type="button"
      data-testid="upload.photo-preview"
      aria-label={webOnlyCopy["upload.preview.edit"]}
      style={{ ...style, cursor: "pointer" }}
      onClick={onPress}
    >
      {image}
    </button>
  ) : (
    <div data-testid="upload.photo-preview" style={style}>
      {image}
    </div>
  );
}

function Indicator({ testId }: { testId: string }): ReactNode {
  return (
    <div
      data-testid={testId}
      role="status"
      aria-busy="true"
      style={{ display: "flex", justifyContent: "center" }}
    >
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="56 20"
          opacity="0.6"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 16 16"
            to="360 16 16"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}
