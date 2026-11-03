import { t } from '../../copy/ko';
import { ToastController } from '../../core/ui/ToastController';
import { makeApiEnv } from '../../test/apiEnv';
import { deferred } from '../../test/deferred';
import { flushAsync } from '../../test/FakeClock';
import { loadFixture, memberSession } from '../../test/fixtures';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { recordToasts } from '../../test/toastLog';
import { SignatureCardController } from './SignatureCardController';
import { SignatureRepository } from './SignatureRepository';

const GET = 'GET /users/me/signature';
const OLD_URL = 'https://cdn.example.test/old/thumbnail.png';
const fx = (path: string) => () => loadFixture(path).toResponse();
const newUrl = (loadFixture('signature/users-me-signature__get-success.json').json as Record<string, string>).signatureThumbnailImageUrl!;
const oldResponse = () => Response.json({ signatureOriginalImageUrl: 'https://cdn.example.test/old/original.png', signatureThumbnailImageUrl: OLD_URL });

function setup() {
  const env = makeApiEnv(memberSession());
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const card = new SignatureCardController({ repository: new SignatureRepository({ api: env.client() }), toast });
  return { ...env, card, toasts };
}

describe('SignatureCardController.refreshAfterChange (설정 사인 카드, 변경 성공 뒤)', () => {
  it('TC-SET-009 변경 전에 시작된 조회가 진행 중이어도 새 GET을 보내고, 그 오래된 응답은 반영하지 않는다', async () => {
    const s = setup();
    const stale = deferred<Response>();
    s.ff.route(GET, () => stale.promise, fx('signature/users-me-signature__get-success.json'));
    const before = s.card.refresh();
    await flushAsync();
    const after = s.card.refreshAfterChange();
    await after;
    expect(s.ff.callsTo(GET)).toHaveLength(2); // refresh처럼 진행 중 요청에 올라타지 않는다
    expect(s.card.state).toEqual({ status: 'content', imageUrl: newUrl });
    stale.resolve(oldResponse());
    await before;
    expect(s.card.state).toEqual({ status: 'content', imageUrl: newUrl });
  });

  it('TC-SET-011 변경 뒤에는 PUT 응답이 아니라 GET으로 재조회한 썸네일로 바뀐다', async () => {
    const s = setup();
    s.ff.route(GET, oldResponse, fx('signature/users-me-signature__get-success.json'));
    await s.card.refresh();
    expect(s.card.state.imageUrl).toBe(OLD_URL);
    await s.card.refreshAfterChange();
    expect(s.card.state).toEqual({ status: 'content', imageUrl: newUrl });
  });

  it('TC-SET-011 썸네일이 null이면 원본으로 바뀐다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-thumbnail-null.json'));
    await s.card.refreshAfterChange();
    const original = (loadFixture('signature/users-me-signature__get-thumbnail-null.json').json as Record<string, string>).signatureOriginalImageUrl;
    expect(s.card.state.imageUrl).toBe(original);
  });

  it('TC-SET-005 재조회가 실패해도 이미 보이던 사인을 유지하고 토스트 sign.load.error를 보인다', async () => {
    const s = setup();
    s.ff.route(GET, oldResponse, fx('signature/users-me-signature__get-internal-error.json'));
    await s.card.refresh();
    const run = s.card.refreshAfterChange();
    await s.clock.advance(5_000);
    await run;
    expect(s.card.state).toEqual({ status: 'content', imageUrl: OLD_URL });
    expect(s.toasts.messages).toEqual([t('sign.load.error')]);
  });

  it('TC-SET-010 변경이 실패해 refreshAfterChange를 부르지 않았다면 진행 중이던 조회의 응답이 정상 반영된다', async () => {
    const s = setup();
    const pending = deferred<Response>();
    s.ff.route(GET, () => pending.promise);
    const run = s.card.refresh();
    await flushAsync();
    pending.resolve(fx('signature/users-me-signature__get-success.json')());
    await run;
    expect(s.card.state).toEqual({ status: 'content', imageUrl: newUrl });
  });

  it('TC-SET-012 refreshAfterChange 중 REAUTHENTICATION_REQUIRED면 토스트 없이 세션 만료를 알린다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-unauthorized.json'));
    s.ff.route('POST /auth/refresh', fx('auth/refresh__reauthentication-required.json'));
    await s.card.refreshAfterChange();
    expect(s.expired.count).toBe(1);
    expect(s.toasts.messages).toEqual([]);
  });

  it('TC-SET-037 clear(계정 전환) 뒤에 늦게 도착한 refreshAfterChange 응답은 반영하지 않는다', async () => {
    const s = setup();
    const gate = deferred<Response>();
    s.ff.route(GET, () => gate.promise);
    const run = s.card.refreshAfterChange();
    await flushAsync();
    s.card.clear();
    gate.resolve(fx('signature/users-me-signature__get-success.json')());
    await run;
    expect(s.card.state).toEqual({ status: 'idle', imageUrl: null });
  });
});
