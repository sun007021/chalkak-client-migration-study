import type { ReactNode } from 'react';
import type { AnalyticsReporter } from './AnalyticsReporter';

export function AnalyticsProvider(_props: { reporter: AnalyticsReporter; children: ReactNode }): ReactNode {
  throw new Error('not implemented');
}

export function useAnalytics(): AnalyticsReporter {
  throw new Error('not implemented');
}
