// D-21: Android에서 RN fetch는 OkHttp를 거치고, OkHttp 기본값 retryOnConnectionFailure(true)는
// 연결 실패 때 POST 같은 비멱등 요청도 조용히 다시 보낸다. 재시도는 앱의 ApiClient 한 곳(멱등 요청만, 최대 2회)에서만
// 하므로, prebuild 때 MainApplication에 자동 재시도를 끄는 OkHttpClientFactory를 심는다.
const { withMainApplication } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const IMPORT_TAG = 'chalkak-okhttp-no-retry-import';
const FACTORY_TAG = 'chalkak-okhttp-no-retry';

const IMPORT_LINE = 'import com.facebook.react.modules.network.OkHttpClientProvider';

// createClientBuilder()는 RN 기본값(ReactCookieJarContainer, 타임아웃 0)을 그대로 유지한다.
// 타임아웃은 ApiClient가 따로 건다(D-21).
const FACTORY_LINES = [
  'OkHttpClientProvider.setOkHttpClientFactory {',
  '  OkHttpClientProvider.createClientBuilder().retryOnConnectionFailure(false).build()',
  '}',
].join('\n');

// 초기화(SoLoader/loadReactNative/ApplicationLifecycleDispatcher)보다 먼저 실행되도록 super.onCreate() 바로 뒤에 둔다.
const ON_CREATE_ANCHOR = /^\s*super\.onCreate\(\)\s*$/m;
const PACKAGE_ANCHOR = /^package\s+\S+\s*$/m;

function applyOkHttpNoRetry(src) {
  const withImport = mergeContents({
    src,
    newSrc: IMPORT_LINE,
    tag: IMPORT_TAG,
    anchor: PACKAGE_ANCHOR,
    offset: 1,
    comment: '//',
  });
  const withFactory = mergeContents({
    src: withImport.contents,
    newSrc: FACTORY_LINES,
    tag: FACTORY_TAG,
    anchor: ON_CREATE_ANCHOR,
    offset: 1,
    comment: '//',
  });
  return withFactory.contents;
}

function transformMainApplication(contents, language) {
  if (language !== 'kt') {
    throw new Error(
      `withOkHttpNoRetry: MainApplication.${language}는 지원하지 않습니다(Kotlin만 지원). SDK 58 템플릿은 Kotlin입니다.`,
    );
  }
  try {
    return applyOkHttpNoRetry(contents);
  } catch (e) {
    throw new Error(
      `withOkHttpNoRetry: MainApplication.kt에서 삽입 위치(package 선언 또는 onCreate의 super.onCreate())를 찾지 못했습니다. 템플릿이 바뀌었는지 확인하세요. (${e instanceof Error ? e.message : e})`,
    );
  }
}

function withOkHttpNoRetry(config) {
  return withMainApplication(config, (cfg) => {
    cfg.modResults.contents = transformMainApplication(
      cfg.modResults.contents,
      cfg.modResults.language,
    );
    return cfg;
  });
}

module.exports = withOkHttpNoRetry;
module.exports.transformMainApplication = transformMainApplication;
