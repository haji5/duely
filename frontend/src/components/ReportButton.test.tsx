import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('../services/api', () => ({
  bracketApi: { report: api.report },
  errorMessage: () => 'Too many requests: the limit is 5 per hour.',
}));

import ReportButton from './ReportButton';

afterEach(() => api.report.mockReset());

describe('ReportButton', () => {
  it('sends the chosen reason and trimmed details, then thanks the reporter', async () => {
    api.report.mockResolvedValue(undefined);
    render(<ReportButton targetType="comment" targetId={42} label="Report the comment by Ann" />);

    await userEvent.click(screen.getByRole('button', { name: 'Report the comment by Ann' }));
    expect(screen.getByRole('dialog', { name: 'Report this comment' })).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled(); // a reason is required

    await userEvent.click(screen.getByLabelText('Harassment or hate'));
    await userEvent.type(screen.getByLabelText(/Details/), '  Insults another player  ');
    await userEvent.click(send);

    expect(api.report).toHaveBeenCalledWith({
      targetType: 'comment', targetId: 42, reason: 'harassment', details: 'Insults another player',
    });
    expect(await screen.findByRole('dialog', { name: 'Thanks for the report' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the form and shows why when sending fails', async () => {
    api.report.mockRejectedValue(new Error('429'));
    render(<ReportButton targetType="bracket" targetId={7} label="Report this bracket" />);

    await userEvent.click(screen.getByRole('button', { name: 'Report this bracket' }));
    await userEvent.click(screen.getByLabelText('Spam or advertising'));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('the limit is 5 per hour');
    expect(screen.getByLabelText('Spam or advertising')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('closes on Escape without sending anything', async () => {
    render(<ReportButton targetType="bracket" targetId={7} label="Report this bracket" />);
    await userEvent.click(screen.getByRole('button', { name: 'Report this bracket' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.report).not.toHaveBeenCalled();
  });
});
