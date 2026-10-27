import { DEFAULT_API_BASE_URL, readAppConfig } from './AppConfig';

describe('readAppConfig', () => {
  it('extra가 없으면 개발 서버 기본값을 쓴다', () => {
    expect(readAppConfig(undefined).apiBaseUrl).toBe(DEFAULT_API_BASE_URL);
  });

  it('extra 값을 쓰고 끝에 슬래시를 보장한다', () => {
    expect(readAppConfig({ apiBaseUrl: 'http://localhost:4010/api/v1' }).apiBaseUrl).toBe(
      'http://localhost:4010/api/v1/',
    );
  });
});
