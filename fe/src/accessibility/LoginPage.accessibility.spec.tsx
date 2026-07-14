import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { LoginPage } from '../pages/LoginPage';

describe('LoginPage accessibility', () => {
  it('has no serious or critical axe violations in the guest entry surface', async () => {
    const { container } = render(
      <LoginPage
        busy={false}
        error={null}
        notice={null}
        onGuestLogin={() => undefined}
        onEmailLogin={() => undefined}
        onRegister={() => undefined}
        onOAuthLogin={() => undefined}
        onClearFeedback={() => undefined}
      />,
    );
    const results = await axe(container);
    const blocking = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
    expect(blocking).toEqual([]);
  });
});
