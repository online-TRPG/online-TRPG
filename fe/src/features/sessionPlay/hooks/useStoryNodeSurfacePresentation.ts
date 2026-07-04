import { useMemo } from 'react';

type StoryCharacterHpLike = {
  currentHp: number;
  maxHp: number;
};

type UseStoryNodeSurfacePresentationParams = {
  nodeTitle?: string | null;
  scenarioTitle?: string | null;
  phase?: string | null;
  sceneText?: string | null;
  isGmView: boolean;
  restTargetCharacterName?: string | null;
  isGmNpcMessage: boolean;
  isGmMessagePending: boolean;
};

export function getStoryCharacterHpPercent(character: StoryCharacterHpLike) {
  if (character.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((character.currentHp / character.maxHp) * 100)));
}

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
}

function splitSceneParagraphs(sceneText: string | null | undefined) {
  const paragraphs = (sceneText ?? '')
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['현재 장면 설명이 아직 준비되지 않았습니다.'];
}

export function useStoryNodeSurfacePresentation({
  nodeTitle,
  scenarioTitle,
  phase,
  sceneText,
  isGmView,
  restTargetCharacterName,
  isGmNpcMessage,
  isGmMessagePending,
}: UseStoryNodeSurfacePresentationParams) {
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(sceneText), [sceneText]);
  const titleText = nodeTitle ?? scenarioTitle ?? '진행 중인 장면';

  return {
    storyNodeBadgeAlt: '스토리 노드',
    titleText,
    statusRowAriaLabel: '장면 상태',
    phaseLabel: getPhaseLabel(phase),
    viewModeLabel: isGmView ? 'GM 화면' : '플레이어 화면',
    mainSectionAriaLabel: '스토리 장면',
    sceneImageEyebrow: '장면 이미지',
    sceneImageFallbackTitle: nodeTitle ?? scenarioTitle ?? '장면 이미지 없음',
    sceneCaptionEyebrow: '현재 장면',
    sceneCaptionTitle: nodeTitle ?? '스토리 노드',
    sceneTextAriaLabel: '장면 설명',
    sceneParagraphs,
    restActionsAriaLabel: '휴식 행동',
    restTargetLabel: `휴식 대상 ${restTargetCharacterName ?? '캐릭터 미선택'}`,
    shortRestLabel: '짧은 휴식',
    shortRestHitDiceAriaLabel: '스토리 노드 짧은 휴식 히트 다이스 사용 수',
    longRestLabel: '긴 휴식',
    gmPanelAriaLabel: 'HUMAN GM 조작',
    gmMessageEyebrow: '장면/NPC 전송',
    gmNpcMessageLabel: 'NPC 대사로 전송',
    gmSpeakerPlaceholder: '화자 이름',
    gmMessagePlaceholder: isGmNpcMessage
      ? 'NPC 대사를 입력하세요.'
      : '플레이어에게 공개할 장면 묘사를 입력하세요.',
    gmPrivateNotePlaceholder: '비공개 GM 메모',
    gmSubmitLabel: isGmMessagePending ? '전송 중' : '전송',
    gmNodeMoveEyebrow: '장면 이동',
    gmDefaultMoveSuffix: ' · 기본 이동',
    gmNodeMoveEmptyText: '현재 노드에서 바로 이동 가능한 노드가 없습니다.',
    partyStripAriaLabel: '파티 캐릭터',
    emptyPartySlotLabel: '빈 슬롯',
    rpSpeechBubbleAriaLabel: '메인 채팅에서 RP 대사 보기',
    currentUserBadgeLabel: '나',
  };
}
