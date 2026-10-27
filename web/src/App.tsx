import { useState } from 'react';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { bootstrapApp } from './app/bootstrap';
import { t } from './copy/ko';

export function App(): ReactNode {
  const [boot] = useState(() => bootstrapApp(import.meta.env));
  if (boot.kind === 'config_error') {
    return (
      <main>
        <p role="alert">{t('common.error.config')}</p>
      </main>
    );
  }
  return <RouterProvider router={boot.router} />;
}
