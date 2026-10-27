import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AnalyticsReporter } from './AnalyticsReporter';

const AnalyticsContext = createContext<AnalyticsReporter | null>(null);

export function AnalyticsProvider({ reporter, children }: { reporter: AnalyticsReporter; children: ReactNode }): ReactNode {
  return <AnalyticsContext.Provider value={reporter}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsReporter {
  const reporter = useContext(AnalyticsContext);
  if (!reporter) throw new Error('AnalyticsProvider가 필요합니다.');
  return reporter;
}
