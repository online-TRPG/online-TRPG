import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionHeaderUtilities } from './SessionHeaderUtilities';

describe('SessionHeaderUtilities', () => {
  it('renders permitted session tools and reports the selected panel', () => {
    const onTogglePanel = vi.fn();
    const { rerender } = render(
      <SessionHeaderUtilities
        showEconomy
        showCalendar
        activePanel={null}
        onTogglePanel={onTogglePanel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '경제' }));
    expect(onTogglePanel).toHaveBeenCalledWith('economy');

    rerender(
      <SessionHeaderUtilities
        showEconomy
        showCalendar
        activePanel="economy"
        onTogglePanel={onTogglePanel}
      />,
    );
    expect(screen.getByRole('button', { name: '경제' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '일정' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not render tools without permission', () => {
    const { container } = render(
      <SessionHeaderUtilities
        showEconomy={false}
        showCalendar={false}
        activePanel={null}
        onTogglePanel={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the active utility panel inside the header utility container', () => {
    render(
      <SessionHeaderUtilities
        showEconomy
        showCalendar
        activePanel="economy"
        onTogglePanel={vi.fn()}
        panel={<aside aria-label="캠페인 경제">경제 패널</aside>}
      />,
    );

    const utilityContainer = screen.getByRole('group', { name: '세션 도구' }).parentElement;
    expect(utilityContainer).toContainElement(screen.getByRole('complementary', { name: '캠페인 경제' }));
  });
});
