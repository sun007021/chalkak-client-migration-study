import { isUpdateRequired, parseAppVersion } from './AppVersion';
import { loadFixture } from '../../core/http/__testing__/loadFixture';

type VersionCase = {
  version: string;
  parsed: boolean;
  major?: number;
  minor?: number;
  patch?: number;
};
const cases = loadFixture<{ cases: VersionCase[] }>('boot/itunes-lookup__malformed').cases;

const installed = { major: 1, minor: 1, patch: 1 };
const v = (text: string) => {
  const parsed = parseAppVersion(text);
  if (!parsed) throw new Error(`파싱 실패: ${text}`);
  return parsed;
};

describe('parseAppVersion', () => {
  it('TC-BOOT-019 "1.2.3"은 major.minor.patch로, "1.1"은 patch=0으로 읽는다', () => {
    expect(parseAppVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseAppVersion('1.1')).toEqual({ major: 1, minor: 1, patch: 0 });
  });

  it.each(cases.map((c) => [c.version, c] as const))('TC-BOOT-020 fixture 표: "%s"', (_text, c) => {
    const result = parseAppVersion(c.version);
    if (c.parsed) {
      expect(result).toEqual({ major: c.major, minor: c.minor, patch: c.patch });
    } else {
      expect(result).toBeNull();
    }
  });

  it('TC-BOOT-020 "1", "1.2.3.4", "1.two.3", "1.2.-1", ""는 모두 파싱 실패다', () => {
    for (const bad of [
      '1',
      '1.2.3.4',
      '1.two.3',
      '1.2.-1',
      '',
      ' ',
      '1..2',
      'v1.2.3',
      '1.2.3-beta',
    ]) {
      expect(parseAppVersion(bad)).toBeNull();
    }
  });
});

describe('isUpdateRequired', () => {
  it('TC-BOOT-016 스토어 major가 높으면 강제 업데이트다', () => {
    expect(isUpdateRequired(installed, v('2.0.0'))).toBe(true);
  });

  it('TC-BOOT-017 스토어 minor가 높으면(1.2.0 vs 1.1.1) 강제 업데이트다', () => {
    expect(isUpdateRequired(installed, v('1.2.0'))).toBe(true);
  });

  it('TC-BOOT-018 patch만 높거나(1.1.2) 같거나(1.1.1) 낮으면(1.0.9) 통과한다', () => {
    expect(isUpdateRequired(installed, v('1.1.2'))).toBe(false);
    expect(isUpdateRequired(installed, v('1.1.1'))).toBe(false);
    expect(isUpdateRequired(installed, v('1.0.9'))).toBe(false);
  });

  it('TC-BOOT-018 스토어 major가 낮으면 minor가 높아도 통과한다(0.9.0 / 설치 1.1.1, 1.0.0 / 설치 2.0.0)', () => {
    expect(isUpdateRequired(installed, v('0.9.0'))).toBe(false);
    expect(isUpdateRequired({ major: 2, minor: 0, patch: 0 }, v('1.5.0'))).toBe(false);
  });
});
