import { LogAnalyticsTracker } from './LogAnalyticsTracker';
import { AnalyticsReporter } from './AnalyticsReporter';
import { RecordingLogger } from '../../test/RecordingLogger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('LogAnalyticsTracker', () => {
  it('REQ-ANL-001 이벤트를 로그로 출력한다', () => {
    const logger = new RecordingLogger();
    new LogAnalyticsTracker(logger).track({ name: 'screen_view', params: { screen_name: 'home' } });
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]!.message).toBe('analytics screen_view');
    expect(logger.entries[0]!.fields).toEqual({ screen_name: 'home' });
  });

  it('TC-ANL-020 Firebase 설정 없이 로그 구현만으로 동작하고 크래시하지 않는다', () => {
    const logger = new RecordingLogger();
    const tracker = new LogAnalyticsTracker(logger);
    const reporter = new AnalyticsReporter({ tracker, logger });
    expect(() => {
      reporter.screenView('login');
      reporter.tabSelected('display');
    }).not.toThrow();
    expect(logger.entries.map((e) => e.message)).toEqual(['analytics screen_view', 'analytics bottom_navigation_selected']);
  });

  it('TC-ANL-019 Web에는 자동 화면 추적(gtag, firebase analytics)이 없다', () => {
    const root = join(__dirname, '..', '..', '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {}).filter((n) => /firebase|gtag|analytics|ga4|segment/i.test(n))).toEqual([]);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/gtag|googletagmanager|firebase/i);
  });
});
