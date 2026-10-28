import withOkHttpNoRetry from './withOkHttpNoRetry';

const { transformMainApplication } = withOkHttpNoRetry;

// Expo SDK 58 템플릿(Kotlin) 형태를 본뜬 fixture.
const TEMPLATE = `package com.chalkak.study.rn

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
`;

describe('withOkHttpNoRetry (D-21)', () => {
  it('D-21: OkHttpClientProvider import를 넣는다', () => {
    const out = transformMainApplication(TEMPLATE, 'kt');
    expect(out).toContain('import com.facebook.react.modules.network.OkHttpClientProvider');
  });

  it('D-21: onCreate에서 React 초기화(loadReactNative, ApplicationLifecycleDispatcher)보다 먼저 팩토리를 건다', () => {
    const out = transformMainApplication(TEMPLATE, 'kt');
    const factory = out.indexOf('OkHttpClientProvider.setOkHttpClientFactory {');
    expect(factory).toBeGreaterThan(-1);
    expect(out).toContain(
      'OkHttpClientProvider.createClientBuilder().retryOnConnectionFailure(false).build()',
    );
    expect(factory).toBeGreaterThan(out.indexOf('super.onCreate()'));
    expect(factory).toBeLessThan(out.indexOf('loadReactNative(this)'));
    expect(factory).toBeLessThan(out.indexOf('ApplicationLifecycleDispatcher.onApplicationCreate'));
  });

  it('D-21: 두 번 적용해도 결과가 같다(멱등)', () => {
    const once = transformMainApplication(TEMPLATE, 'kt');
    const twice = transformMainApplication(once, 'kt');
    expect(twice).toBe(once);
    expect(twice.match(/setOkHttpClientFactory/g)).toHaveLength(1);
    expect(
      twice.match(/import com\.facebook\.react\.modules\.network\.OkHttpClientProvider/g),
    ).toHaveLength(1);
  });

  it('D-21: 삽입 위치(onCreate)를 못 찾으면 명확한 오류로 실패한다', () => {
    const broken = TEMPLATE.replace('super.onCreate()', 'initialize()');
    expect(() => transformMainApplication(broken, 'kt')).toThrow(/withOkHttpNoRetry.*onCreate/);
  });

  it('D-21: package 선언이 없으면 오류로 실패한다', () => {
    expect(() => transformMainApplication('class A', 'kt')).toThrow(/withOkHttpNoRetry/);
  });

  it('D-21: Kotlin이 아닌 MainApplication은 조용히 넘기지 않고 오류를 낸다', () => {
    expect(() => transformMainApplication(TEMPLATE, 'java')).toThrow(/Kotlin/);
  });

  it('D-21: app.config.ts에 플러그인이 등록되어 있다', () => {
    jest.isolateModules(() => {
      const prev = process.env.KAKAO_NATIVE_APP_KEY;
      delete process.env.KAKAO_NATIVE_APP_KEY;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const config = require('../app.config').default;
      expect(config.plugins).toContain('./plugins/withOkHttpNoRetry');
      if (prev !== undefined) process.env.KAKAO_NATIVE_APP_KEY = prev;
    });
  });

  it('D-21: 카카오 키가 있어도 플러그인이 함께 등록된다', () => {
    jest.isolateModules(() => {
      const prev = process.env.KAKAO_NATIVE_APP_KEY;
      process.env.KAKAO_NATIVE_APP_KEY = 'test-key';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const config = require('../app.config').default;
      expect(config.plugins).toContain('./plugins/withOkHttpNoRetry');
      expect(config.plugins).toContainEqual([
        '@react-native-seoul/kakao-login',
        { kakaoAppKey: 'test-key' },
      ]);
      if (prev === undefined) delete process.env.KAKAO_NATIVE_APP_KEY;
      else process.env.KAKAO_NATIVE_APP_KEY = prev;
    });
  });
});
