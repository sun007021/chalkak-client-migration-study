import { base64ToBytes } from '../encoding/base64';

/**
 * 액세스 토큰(JWT) payload에 `session_id` 클레임이 있는지(REQ-PUSH-010). 서명은 검증하지 않는다.
 * 형식이 틀리거나(세 조각이 아님, base64·JSON 오류, 객체가 아님) 값이 비어 있으면 예외 없이 false.
 */
export function hasSessionId(jwt: string): boolean {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  try {
    const bytes = base64ToBytes(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    // 키 검사만 하므로 바이트를 그대로 문자로 옮겨도 충분하다(ASCII 키).
    let json = '';
    for (const byte of bytes) json += String.fromCharCode(byte);
    const payload: unknown = JSON.parse(json);
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const value = (payload as Record<string, unknown>).session_id;
    return typeof value === 'string' && value !== '';
  } catch {
    // 잘못된 토큰은 session_id 없음으로 취급한다(호출자가 refresh로 복구한다).
    return false;
  }
}
