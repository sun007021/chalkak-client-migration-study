import type { CSSProperties, ReactNode } from "react";
import { useContainer } from "../../app/AppContext";
import { useViewModel } from "../../core/state/useViewModel";
import { LoadingIndicator } from "../../core/ui/StateViews";
import type { UploadGate } from "./UploadGate";

const overlayStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  bottom: 0,
  left: "var(--column-inset)",
  right: "var(--column-inset)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.2)",
  zIndex: 40,
};

/**
 * 게이트 확인 중 표시(`upload-entry.loading`, role="status"). 라우트 루트(전역)에 한 번 그리며 container.uploadGate.state.checking일 때만 DOM에 있다.
 * container.uploadGate가 null(테스트용 uploadEntry 덮어쓰기)이면 아무것도 그리지 않는다.
 */
export function UploadEntryLoading(): ReactNode {
  const { uploadGate } = useContainer();
  return uploadGate ? <CheckingOverlay gate={uploadGate} /> : null;
}

function CheckingOverlay({ gate }: { gate: UploadGate }): ReactNode {
  const { checking } = useViewModel(gate);
  if (!checking) return null;
  return (
    <div style={overlayStyle}>
      <LoadingIndicator screenId="upload-entry" />
    </div>
  );
}
