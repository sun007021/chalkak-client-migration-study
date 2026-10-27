import { render, screen } from '@testing-library/react';
import { App } from './App';

it('앱 루트를 그린다', () => {
  render(<App />);
  expect(screen.getByTestId('app.root')).toBeInTheDocument();
});
