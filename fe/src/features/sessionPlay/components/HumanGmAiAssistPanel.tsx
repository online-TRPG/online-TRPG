import { useState } from 'react';
import type {
  AiHumanGmAssistSuggestionRequestDto,
  CreateHumanGmAiAssistSuggestionDto,
  HumanGmAiAssistSuggestionDto,
} from '@trpg/shared-types';
import './HumanGmAiAssistPanel.css';

type GmAiAssistType = CreateHumanGmAiAssistSuggestionDto['assistType'];

export type HumanGmAiAssistNodeMoveOption = {
  nodeId: string;
  title: string;
  label?: string | null;
};

interface HumanGmAiAssistPanelProps {
  nodeId?: string | null;
  className?: string;
  suggestions?: HumanGmAiAssistSuggestionDto[];
  nodeMoveOptions?: HumanGmAiAssistNodeMoveOption[];
  onCreate?: (payload: CreateHumanGmAiAssistSuggestionDto) => Promise<void> | void;
  onGenerate?: (payload: AiHumanGmAssistSuggestionRequestDto) => Promise<void> | void;
  onAccept?: (suggestion: HumanGmAiAssistSuggestionDto) => Promise<void> | void;
  isBusy?: boolean;
  isPending?: boolean;
  sceneSummary?: string | null;
  recentLogs?: string[];
}

const gmAiAssistTypeOptions: Array<{ value: GmAiAssistType; label: string }> = [
  { value: 'scene_text', label: '장면 묘사' },
  { value: 'npc_dialogue', label: 'NPC 대사' },
  { value: 'node_move', label: '장면 이동' },
  { value: 'combat', label: '전투 조언' },
  { value: 'rules', label: '규칙 조언' },
  { value: 'other', label: '기타' },
];

function getGmAiAssistTypeLabel(assistType: string) {
  return gmAiAssistTypeOptions.find((option) => option.value === assistType)?.label ?? assistType;
}

export function HumanGmAiAssistPanel({
  nodeId,
  className,
  suggestions = [],
  nodeMoveOptions = [],
  onCreate,
  onGenerate,
  onAccept,
  isBusy = false,
  isPending = false,
  sceneSummary,
  recentLogs = [],
}: HumanGmAiAssistPanelProps) {
  const [assistType, setAssistType] = useState<GmAiAssistType>('scene_text');
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('');
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === 'PENDING');

  async function handleCreate() {
    const trimmedContent = content.trim();
    if (!trimmedContent || !onCreate || isPending) return;

    const trimmedTarget = target.trim();
    await onCreate({
      assistType,
      content: trimmedContent,
      suggestedActionId: assistType === 'node_move' ? trimmedTarget || null : null,
      targetId: assistType === 'npc_dialogue' ? trimmedTarget || null : nodeId ?? null,
    });
    setContent('');
    if (assistType !== 'node_move') {
      setTarget('');
    }
  }

  async function handleGenerate() {
    const trimmedPrompt = content.trim();
    if (!trimmedPrompt || !onGenerate || isPending) return;

    const trimmedTarget = target.trim();
    await onGenerate({
      assistType,
      prompt: trimmedPrompt,
      sceneSummary: sceneSummary?.trim() || '현재 장면 요약 없음',
      recentLogs,
      suggestedActionId: assistType === 'node_move' ? trimmedTarget || null : null,
      targetId: assistType === 'npc_dialogue' ? trimmedTarget || null : nodeId ?? null,
    });
    setContent('');
    if (assistType !== 'node_move') {
      setTarget('');
    }
  }

  return (
    <section className={['human-gm-ai-assist-panel', className].filter(Boolean).join(' ')}>
      <span className="human-gm-ai-assist-eyebrow">AI 보조 제안</span>
      <div className="human-gm-ai-assist-compose">
        <select
          className="human-gm-ai-assist-input"
          value={assistType}
          disabled={isPending}
          aria-label="AI 보조 제안 유형"
          onChange={(event) => {
            setAssistType(event.target.value as GmAiAssistType);
            setTarget('');
          }}
        >
          {gmAiAssistTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {assistType === 'node_move' ? (
          <select
            className="human-gm-ai-assist-input"
            value={target}
            disabled={isPending}
            aria-label="AI 보조 이동 대상"
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">이동할 장면 선택</option>
            {nodeMoveOptions.map((option) => (
              <option key={option.nodeId} value={option.nodeId}>
                {option.label?.trim() || option.title}
              </option>
            ))}
          </select>
        ) : assistType === 'npc_dialogue' ? (
          <input
            className="human-gm-ai-assist-input"
            value={target}
            placeholder="NPC 화자 이름"
            maxLength={100}
            disabled={isPending}
            onChange={(event) => setTarget(event.target.value)}
          />
        ) : null}
        <textarea
          className="human-gm-ai-assist-textarea"
          value={content}
          placeholder="검토할 AI 제안 내용을 입력하세요."
          rows={3}
          maxLength={2000}
          disabled={isPending}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="human-gm-ai-assist-actions">
          <button
            type="button"
            disabled={
              isBusy ||
              isPending ||
              !onCreate ||
              !content.trim() ||
              (assistType === 'node_move' && !target)
            }
            onClick={() => void handleCreate()}
          >
            제안 등록
          </button>
          {onGenerate ? (
            <button
              type="button"
              disabled={
                isBusy ||
                isPending ||
                !content.trim() ||
                (assistType === 'node_move' && !target)
              }
              onClick={() => void handleGenerate()}
            >
              AI 생성
            </button>
          ) : null}
        </div>
      </div>
      {pendingSuggestions.length ? (
        <div className="human-gm-ai-assist-list">
          {pendingSuggestions.map((suggestion) => (
            <article key={suggestion.id}>
              <div>
                <strong>{getGmAiAssistTypeLabel(suggestion.assistType)}</strong>
                <span>{suggestion.content}</span>
              </div>
              <button
                type="button"
                disabled={isBusy || isPending || !onAccept}
                onClick={() => void onAccept?.(suggestion)}
              >
                승인
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="human-gm-ai-assist-empty">승인 대기 중인 AI 제안이 없습니다.</p>
      )}
    </section>
  );
}
