import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BattleMapStageFrame } from '../components/battleMap/BattleMapStageFrame';

describe('BattleMapStageFrame keyboard movement surface', () => {
  it('focuses the map and forwards arrow keys without a separate movement panel', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();

    render(
      <BattleMapStageFrame
        containerRef={createRef<HTMLDivElement>()}
        isPanMode={false}
        showSessionViewControls={false}
        onTogglePan={vi.fn()}
        keyboardMoveEnabled
        keyboardMoveStatus="방향키로 이동 경로를 설정할 수 있습니다."
        keyboardMoveLabel="전투 지도 · 방향키로 이동 경로 설정"
        onKeyboardMoveKeyDown={onKeyDown}
      >
        <div>지도</div>
      </BattleMapStageFrame>
    );

    const mapSurface = screen.getByLabelText('전투 지도 · 방향키로 이동 경로 설정');
    await user.click(mapSurface);
    await user.keyboard('{ArrowRight}');

    expect(mapSurface).toHaveFocus();
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'ArrowRight' }));
    expect(screen.getByRole('status')).toHaveTextContent('방향키로 이동 경로를 설정할 수 있습니다.');
  });
});
