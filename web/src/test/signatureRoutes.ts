import { loadFixture } from './fixtures';
import type { FakeFetch, Responder } from './fakeFetch';

/** shared/fixtures 응답을 그대로 돌려주는 Responder. */
export const fx =
  (path: string): Responder =>
  () =>
    loadFixture(path).toResponse();

export const SIGNUP_UPLOADS = 'POST /auth/social-signup/signature/uploads';
export const SIGNUP_PUT = 'PUT /__upload/55555555-5555-4555-8555-555555555512';
export const SIGNUP_CONFIRM = 'POST /auth/social-signup';
export const CHANGE_UPLOADS = 'POST /users/me/signature/uploads';
export const CHANGE_PUT = 'PUT /__upload/55555555-5555-4555-8555-555555555521';
export const CHANGE_CONFIRM = 'PUT /users/me/signature';
export const CARD_GET = 'GET /users/me/signature';

/** 가입 3단계 경로를 한 번에 등록한다. FakeFetch는 먼저 등록한 경로가 우선이므로 단계별 응답은 여기서 덮어쓴다. */
export function routeSignup(ff: FakeFetch, o: { uploads?: Responder[]; put?: Responder[]; signup?: Responder[] } = {}): void {
  ff.route(SIGNUP_UPLOADS, ...(o.uploads ?? [fx('onboarding/signup-uploads__success.json')]));
  ff.route(SIGNUP_PUT, ...(o.put ?? [fx('onboarding/presigned-put__ok.json')]));
  ff.route(SIGNUP_CONFIRM, ...(o.signup ?? [fx('onboarding/signup__success.json')]));
}

/** 사인 변경 3단계와 설정 카드 조회를 한 번에 등록한다. */
export function routeChange(ff: FakeFetch, o: { uploads?: Responder[]; put?: Responder[]; confirm?: Responder[]; get?: Responder[] } = {}): void {
  ff.route(CHANGE_UPLOADS, ...(o.uploads ?? [fx('signature/users-me-signature-uploads__success.json')]));
  ff.route(CHANGE_PUT, ...(o.put ?? [fx('signature/presigned-put__ok.json')]));
  ff.route(CHANGE_CONFIRM, ...(o.confirm ?? [fx('signature/users-me-signature__put-success.json')]));
  ff.route(CARD_GET, ...(o.get ?? [fx('signature/users-me-signature__get-success.json')]));
}

export const sequence = (ff: FakeFetch): string[] => ff.calls.map((c) => `${c.method} ${c.path}`);
