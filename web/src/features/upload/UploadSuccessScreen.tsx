import { Button } from "../../core/ui/Button";
import { color, font, radius, space } from "../../design/tokens";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { useContainer } from "../../app/AppContext";
import { ROUTES } from "../../app/paths";
import { t } from "../../copy/ko";
import { webOnlyCopy } from "../../copy/webOnly";
import { useScreenView } from "../../core/analytics/useScreenView";
import { objectParticle } from "./koreanParticle";
import { successNextPath } from "./uploadNavigation";
import type { UploadResult } from "./UploadResult";

/**
 * 업로드 성공 화면(`/upload/success`, screen_view `photo_upload_success`). container.uploadResults.get()이 없으면(새로고침·딥링크) 홈으로 replace.
 * data-testid: upload-success.root, upload-success.message, upload-success.status-message, upload-success.confirm-button.
 * "확인했어요."는 결과를 비우고 successNextPath(topicDate)로 replace 이동한다(뒤로 가기가 업로드·성공 화면으로 돌아오지 않는다).
 */
export function UploadSuccessScreen(): ReactNode {
  const container = useContainer();
  // 결과는 마운트 때 한 번 잡는다: "확인했어요."가 저장소를 비워도 이동하기 전까지 화면이 그대로 있다.
  const [result] = useState(() => container.uploadResults.get());
  return result ? (
    <UploadSuccessView result={result} />
  ) : (
    <Navigate to={ROUTES.home} replace />
  );
}

const rootStyle: CSSProperties = {
  minHeight: "100dvh",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: space.lg,
  padding: `${space.xl} ${space.lg}`,
  background: color.background,
};
const cardStyle: CSSProperties = {
  width: "100%",
  maxHeight: "55dvh",
  objectFit: "contain",
  display: "block",
  borderRadius: radius.large,
  background: color.surface,
};

function UploadSuccessView({ result }: { result: UploadResult }): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  useScreenView("photo_upload_success");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = container.blobUrls.create(result.photo);
    // 외부 자원(blob URL)을 화면 수명에 묶는 것이라 의도된 setState다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhotoUrl(url);
    return () => container.blobUrls.revoke(url);
  }, [container, result.photo]);

  const statusKey =
    result.moderationStatus === "PENDING"
      ? "upload.success.pending"
      : result.moderationStatus === "VALIDATING"
        ? "upload.success.validating"
        : null;
  const confirm = () => {
    container.uploadResults.clear();
    void navigate(successNextPath(result.topicDate), { replace: true });
  };
  return (
    <div data-testid="upload-success.root" style={rootStyle}>
      {photoUrl && <img src={photoUrl} alt={webOnlyCopy["upload.success.photo-alt"]} style={cardStyle} />}
      <p data-testid="upload-success.message" style={{ margin: 0, textAlign: "center", color: color.textPrimary, whiteSpace: "pre-line", ...font("title3") }}>
        {t("upload.success.title", {
          주제: result.topicTitle,
          "을/를": objectParticle(result.topicTitle),
        })}
      </p>
      {statusKey && (
        <p data-testid="upload-success.status-message" style={{ margin: 0, textAlign: "center", color: color.textSecondary, whiteSpace: "pre-line", ...font("callout") }}>{t(statusKey)}</p>
      )}
      <Button fill data-testid="upload-success.confirm-button" style={{ marginTop: "auto" }} onClick={confirm}>
        {t("upload.success.confirm")}
      </Button>
    </div>
  );
}
