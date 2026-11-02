import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShareButton from './ShareButton';

const setNavigator = (props: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
};

afterEach(() => setNavigator({ share: undefined, clipboard: undefined }));

describe('ShareButton', () => {
  it('uses the system share sheet with the canonical URL when there is one', async () => {
    const share = vi.fn(async () => {});
    setNavigator({ share });
    render(<ShareButton path="/results/3" title="Bun Zone results" text="Alpha leads" />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ title: 'Bun Zone results', text: 'Alpha leads', url: `${window.location.origin}/results/3` });
  });

  it('copies the link and says so when sharing is not available', async () => {
    const writeText = vi.fn(async () => {});
    setNavigator({ share: undefined, clipboard: { writeText } });
    render(<ShareButton path="/bracket/3" title="Bun Zone" text="Play" />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/bracket/3`);
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });

  it('shows the link to copy by hand when the clipboard is blocked', async () => {
    setNavigator({ share: undefined, clipboard: undefined });
    render(<ShareButton path="/bracket/3" title="Bun Zone" text="Play" />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByLabelText('Copy this link')).toHaveValue(`${window.location.origin}/bracket/3`);
  });
});
