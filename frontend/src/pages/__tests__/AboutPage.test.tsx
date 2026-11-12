import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Footer, { LICENSE_URL, REPO_URL } from '../../components/Footer';
import AboutPage from '../AboutPage';
import PrivacyPage from '../PrivacyPage';
import NotFoundPage from '../NotFoundPage';

// Same routes as App.tsx for the pages under test, with the footer outside them.
const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    <Footer />
  </MemoryRouter>,
);

afterEach(cleanup);

describe('Footer', () => {
  it('links to the about page, the GitHub repo and the license', () => {
    renderAt('/');
    const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
    expect(footer.getByRole('link', { name: 'How Duely works' })).toHaveAttribute('href', '/about');
    expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/haji5/duely');
    expect(footer.getByRole('link', { name: 'License' })).toHaveAttribute('href', LICENSE_URL);
    expect(LICENSE_URL.startsWith(REPO_URL)).toBe(true);
  });
});

describe('/about', () => {
  it('renders the how-it-works page with its own title and description', () => {
    renderAt('/about');
    expect(screen.getByRole('heading', { level: 1, name: 'How Duely works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'How are the rankings calculated?' })).toBeInTheDocument();
    expect(document.title).toBe('How Duely works: brackets, voting and rankings | Duely');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content'))
      .toMatch(/^How Duely brackets work/);
  });

  it('is an exact route: /aboutx is not found', () => {
    renderAt('/aboutx');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('PrivacyPage', () => {
  it('says what is stored, what other sites see and how to delete it', () => {
    renderAt('/privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    for (const name of ['What Duely stores', 'What your browser keeps', 'What other sites see', 'Deleting your data']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText(/youtube-nocookie\.com/)).toBeInTheDocument();
  });

  it('is linked from the about page', () => {
    renderAt('/about');
    expect(screen.getByRole('link', { name: 'privacy page' })).toHaveAttribute('href', '/privacy');
  });
});
