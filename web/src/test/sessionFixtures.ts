import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StoredSession } from '../core/auth/SessionStore';

const ROOT = join(__dirname, '..', '..', '..', 'shared', 'fixtures', 'boot');

type Stored = {
  userId?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  guest?: boolean;
};

export interface StorageFixture {
  stored: Stored;
  expect: { destination: 'login' | 'home'; mode?: 'member' | 'guest'; storageCleared?: boolean; crash?: boolean };
  corrupted: boolean;
  /** 저장소 시드(SessionStore 값). 토큰 4종이 다 없으면 tokens는 null(= userId만 있는 불완전 세션 포함). */
  session: StoredSession;
  /** IndexedDbSessionStore 레코드 모양(access token 제외, 시각은 epoch ms). 있는 키만 담는다. */
  idbRecord: Record<string, unknown>;
}

/** shared/fixtures/boot/session__*.json(`_kind: storage`)을 읽는다. 시각 문자열은 epoch ms로 바꾼다. */
export function loadStorageFixture(name: string): StorageFixture {
  const raw = JSON.parse(readFileSync(join(ROOT, `${name}.json`), 'utf8')) as { stored: Stored; expect: StorageFixture['expect']; corrupted?: boolean };
  const s = raw.stored;
  const ms = (v: string | undefined) => (v === undefined ? undefined : Date.parse(v));
  const complete = s.accessToken !== undefined && s.refreshToken !== undefined && s.accessTokenExpiresAt !== undefined && s.refreshTokenExpiresAt !== undefined;
  const session: StoredSession = {
    userId: s.userId ?? null,
    tokens: complete
      ? { accessToken: s.accessToken!, accessTokenExpiresAt: ms(s.accessTokenExpiresAt)!, refreshToken: s.refreshToken!, refreshTokenExpiresAt: ms(s.refreshTokenExpiresAt)! }
      : null,
    isGuest: s.guest === true,
  };
  const idbRecord: Record<string, unknown> = {};
  if (s.userId !== undefined) idbRecord.userId = s.userId;
  if (s.refreshToken !== undefined) idbRecord.refreshToken = s.refreshToken;
  if (s.accessTokenExpiresAt !== undefined) idbRecord.accessTokenExpiresAt = ms(s.accessTokenExpiresAt);
  if (s.refreshTokenExpiresAt !== undefined) idbRecord.refreshTokenExpiresAt = ms(s.refreshTokenExpiresAt);
  if (s.guest !== undefined) idbRecord.guest = s.guest;
  return { stored: s, expect: raw.expect, corrupted: raw.corrupted === true, session, idbRecord };
}
