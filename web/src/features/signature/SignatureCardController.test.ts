import { t } from '../../copy/ko';
import { ToastController } from '../../core/ui/ToastController';
import { makeApiEnv } from '../../test/apiEnv';
import { jsonResponse, networkFailure } from '../../test/fakeFetch';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { SignatureCardController } from './SignatureCardController';
import { SignatureRepository } from './SignatureRepository';

const GET = 'GET /users/me/signature';
const fx = (path: string) => () => loadFixture(path).toResponse();
const body = (path: string) => loadFixture(path).json as Record<string, string>;

function setup() {
  const env = makeApiEnv(memberSession());
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const card = new SignatureCardController({ repository: new SignatureRepository({ api: env.client() }), toast });
  const refresh = async () => {
    const result = track(card.refresh());
    await env.clock.advance(0);
    return result;
  };
  return { ...env, card, toast, refresh };
}

describe('SignatureCardController', () => {
  it('처음에는 idle이고 보여 줄 사인이 없다', () => {
    const { card } = setup();
    expect(card.state).toEqual({ status: 'idle', imageUrl: null });
  });

  it('TC-SIGN-026 refresh는 GET /users/me/signature를 부르고 썸네일을 사인 카드 이미지로 쓴다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-success.json'));
    await s.refresh();
    expect(s.ff.callsTo(GET)).toHaveLength(1);
    expect(s.card.state).toEqual({ status: 'content', imageUrl: body('signature/users-me-signature__get-success.json').signatureThumbnailImageUrl });
    expect(s.toast.state.toast).toBeNull();
  });

  it('TC-SIGN-026 썸네일이 null이면 원본을 쓴다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-thumbnail-null.json'));
    await s.refresh();
    expect(s.card.state.imageUrl).toBe(body('signature/users-me-signature__get-thumbnail-null.json').signatureOriginalImageUrl);
  });

  it('TC-SIGN-027 REQ-SIGN-023 화면이 다시 보일 때마다(refresh마다) GET으로 재조회하고 새 응답으로 바꾼다', async () => {
    const s = setup();
    s.ff.route(
      GET,
      () => jsonResponse(200, { signatureOriginalImageUrl: 'https://cdn.example.test/o1.png', signatureThumbnailImageUrl: 'https://cdn.example.test/t1.png' }),
      () => jsonResponse(200, { signatureOriginalImageUrl: 'https://cdn.example.test/o2.png', signatureThumbnailImageUrl: 'https://cdn.example.test/t2.png' }),
    );
    await s.refresh();
    expect(s.card.state.imageUrl).toBe('https://cdn.example.test/t1.png');
    await s.refresh();
    expect(s.card.state.imageUrl).toBe('https://cdn.example.test/t2.png');
    expect(s.ff.callsTo(GET)).toHaveLength(2);
  });

  it('REQ-SIGN-014 조회가 진행 중이면 중복 요청하지 않고 같은 결과를 기다린다', async () => {
    const s = setup();
    s.ff.route(GET, async () => {
      await s.clock.sleep(1_000);
      return loadFixture('signature/users-me-signature__get-success.json').toResponse();
    });
    const a = track(s.card.refresh());
    const b = track(s.card.refresh());
    await s.clock.advance(0);
    expect(s.card.state.status).toBe('loading');
    await s.clock.advance(1_000);
    expect(a.state).toBe('fulfilled');
    expect(b.state).toBe('fulfilled');
    expect(s.ff.callsTo(GET)).toHaveLength(1);
    expect(s.card.state.status).toBe('content');
  });

  it('조회 중에도 이미 보이던 사인은 imageUrl로 유지한다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-success.json'), async () => {
      await s.clock.sleep(1_000);
      return loadFixture('signature/users-me-signature__get-thumbnail-null.json').toResponse();
    });
    await s.refresh();
    const before = s.card.state.imageUrl;
    track(s.card.refresh());
    await s.clock.advance(0);
    expect(s.card.state).toEqual({ status: 'loading', imageUrl: before });
  });

  it('REQ-SIGN-015 조회가 실패하면 이미 보이던 사인은 그대로 두고 토스트 sign.load.error를 보인다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-success.json'), fx('common/error__internal-500.json'));
    await s.refresh();
    const before = s.card.state.imageUrl;
    const second = track(s.card.refresh());
    await s.clock.advance(1_500); // GET 백오프 재시도(0.5초 + 1초)가 끝난 시점. 토스트는 2.5초 뒤 사라진다
    expect(second.state).toBe('fulfilled'); // 던지지 않는다
    expect(s.card.state).toEqual({ status: 'content', imageUrl: before });
    expect(s.toast.state.toast?.message).toBe(t('sign.load.error'));
  });

  it('보이던 사인이 없을 때 조회가 실패하면 error 상태(이미지 없음)이고 토스트는 없다', async () => {
    const s = setup();
    s.ff.route(GET, networkFailure);
    const result = track(s.card.refresh());
    await s.clock.advance(10_000);
    expect(result.state).toBe('fulfilled');
    expect(s.card.state).toEqual({ status: 'error', imageUrl: null });
    expect(s.toast.state.toast).toBeNull();
  });

  it('TC-SIGN-040 400 SIGNATURE_REGISTRATION_REQUIRED면 registration_required, 이미지는 비우고 오류 토스트는 없다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-success.json'), fx('signature/users-me-signature__get-registration-required.json'));
    await s.refresh();
    expect(s.card.state.imageUrl).not.toBeNull();
    await s.refresh();
    expect(s.card.state).toEqual({ status: 'registration_required', imageUrl: null });
    expect(s.toast.state.toast).toBeNull();
  });

  it('401(갱신 후에도 실패)은 토스트 없이 끝난다 — 로그인 화면 이동은 세션 이벤트가 맡는다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-unauthorized.json'));
    s.ff.route('POST /auth/refresh', fx('auth/refresh__reauthentication-required.json'));
    await s.refresh();
    expect(s.toast.state.toast).toBeNull();
    expect(s.expired.count).toBe(1);
  });

  it('TC-SIGN-038 clear(계정 전환·로그아웃) 뒤에 늦게 도착한 응답은 반영하지 않는다', async () => {
    const s = setup();
    s.ff.route(GET, async () => {
      await s.clock.sleep(1_000);
      return loadFixture('signature/users-me-signature__get-success.json').toResponse();
    });
    const pending = track(s.card.refresh());
    await s.clock.advance(0);
    s.card.clear();
    await s.clock.advance(1_000);
    expect(pending.state).toBe('fulfilled');
    expect(s.card.state).toEqual({ status: 'idle', imageUrl: null });
  });

  it('TC-SIGN-038 clear는 보이던 사인을 비워 이전 계정의 사인이 남지 않는다', async () => {
    const s = setup();
    s.ff.route(GET, fx('signature/users-me-signature__get-success.json'));
    await s.refresh();
    s.card.clear();
    expect(s.card.state).toEqual({ status: 'idle', imageUrl: null });
  });

  it('TC-SIGN-039 정지 회원이어도 GET은 성공해 사인이 보인다', async () => {
    const s = setup(); // 정지 여부는 GET 응답에 영향이 없다(403 아님)
    s.ff.route(GET, fx('signature/users-me-signature__get-success.json'));
    await s.refresh();
    expect(s.card.state.status).toBe('content');
  });
});
