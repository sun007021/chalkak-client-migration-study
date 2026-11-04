import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { t } from '../../copy/ko';
import { color, font, radius, space } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { IcBell, IcClock, IcSmartphone } from '../../core/ui/icons.generated';
import type { IconComponent } from '../../core/ui/icons.generated';
import { useDialogFocus } from '../../core/ui/useDialogFocus';

const LINES: readonly { key: 'ai.start.line1' | 'ai.start.line2' | 'ai.start.line3'; Icon: IconComponent }[] = [
  { key: 'ai.start.line1', Icon: IcClock },
  { key: 'ai.start.line2', Icon: IcSmartphone },
  { key: 'ai.start.line3', Icon: IcBell },
];

/**
 * AI 피드백 시작·재요청 시트(상세 알약과 홈 카드 공용, REQ-AIR-019, 052). "분석 시작하기"를 눌러야 요청하고 닫기는 요청 없이 닫는다.
 * 누르면 호출한 쪽이 시트를 닫으므로 요청 중 비활성 상태는 따로 두지 않는다.
 * 원본 AIReviewStartSheet(screens-a §7.5): 하단 시트(라운드 28), 타이틀 title3, 안내 박스(background, 라운드 16, 안쪽 16) 안에 36 원 + 아이콘 + subheadline semibold.
 */
export function AiStartSheet({ retry, onConfirm, onClose }: { retry: boolean; onConfirm: () => void; onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  useDialogFocus(ref, onClose, startRef);
  return (
    <div className="ck-overlay ck-overlay--sheet" style={{ zIndex: 200 }} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} data-testid="ai-start-sheet.root" role="dialog" aria-modal="true" aria-labelledby={titleId} className="ck-sheet" style={{ paddingTop: space.sm }}>
        <div className="ck-sheet__handle" aria-hidden="true" />
        <h2 id={titleId} style={{ margin: `${space.sm} 0 ${space.xl}`, ...font('title3') }}>
          {retry ? t('ai.start.title-retry') : t('ai.start.title')}
        </h2>
        <div data-testid="ai-start-sheet.description" style={{ display: 'flex', flexDirection: 'column', gap: space.lg, padding: space.lg, borderRadius: radius.large, background: color.background }}>
          {LINES.map(({ key, Icon }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
              <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: color.surfaceElevated, color: color.iconSecondary }}>
                <Icon size={18} />
              </span>
              <p style={{ margin: 0, ...font('subheadline'), fontWeight: 600 }}>{t(key)}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm, marginTop: space.xl }}>
          <Button ref={startRef} fill data-testid="ai-start-sheet.start-button" onClick={onConfirm}>
            {t('ai.start.confirm')}
          </Button>
          <Button variant="outlined" fill data-testid="ai-start-sheet.close-button" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
