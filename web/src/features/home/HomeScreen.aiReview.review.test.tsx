import { vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { aiGet, aiPost, getFx, postFx } from '../../test/aiReviewHarness';
import { advance, openApp } from '../../test/postScreens';

vi.setConfig({ testTimeout: 15_000 });

describe('홈 AI 카드 화면 코드리뷰 회귀', () => {
  it('리뷰1 REQ-AIR-027 REQ-HOME-036 폴링 창(300초)이 끝나면 진행 중 카드 아래에 안내 문구가 status로 보인다', async () => {
    const { h } = await openApp({ path: '/home', routes: { [aiGet()]: getFx('processing') } });
    const card = await screen.findByTestId('home.ai-card');
    expect(within(card).queryByRole('status')).toBeNull();
    await advance(h, 300_000);
    expect(await within(card).findByRole('status')).toHaveTextContent(t('ai.poll.timeout'));
    expect(screen.getByTestId('home.ai-processing')).toHaveTextContent(t('ai.card.processing'));
  });

  it('리뷰3 REQ-AIR-019 NONE 카드의 버튼은 시작 시트를 열고 닫으면 POST가 없다', async () => {
    const { fixtures } = await openApp({ path: '/home', routes: { [aiPost()]: postFx('202-processing') } });
    fireEvent.click(await screen.findByTestId('home.ai-request-button'));
    expect(await screen.findByTestId('ai-start-sheet.root')).toHaveAccessibleName(t('ai.start.title'));
    fireEvent.click(screen.getByTestId('ai-start-sheet.close-button'));
    expect(screen.queryByTestId('ai-start-sheet.root')).toBeNull();
    expect(fixtures.calls(aiPost())).toHaveLength(0);
  });
});
