type UseExplorationNodeSurfacePresentationParams = {
  nodeTitle?: string | null;
  scenarioTitle?: string | null;
  phase?: string | null;
  isGmView: boolean;
  isGmPanelCollapsed: boolean;
  isGmNpcMessage: boolean;
  isGmMessagePending: boolean;
  isInventoryExpanded: boolean;
  isGmInventoryGrantPending: boolean;
};

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
}

export function useExplorationNodeSurfacePresentation({
  nodeTitle,
  scenarioTitle,
  phase,
  isGmView,
  isGmPanelCollapsed,
  isGmNpcMessage,
  isGmMessagePending,
  isInventoryExpanded,
  isGmInventoryGrantPending,
}: UseExplorationNodeSurfacePresentationParams) {
  return {
    nodeBadgeAlt: '탐험 노드',
    titleText: nodeTitle ?? scenarioTitle ?? '탐색 중인 지역',
    statusRowAriaLabel: '탐색 상태',
    phaseLabel: getPhaseLabel(phase),
    viewModeLabel: isGmView ? 'GM 화면' : '플레이어 화면',
    mapPanelAriaLabel: '탐색 지도',
    mapTitle: nodeTitle ?? '탐색 지도',
    mapPlaceholderEyebrow: '탐색 지도',
    mapPlaceholderTitle: '맵을 불러오는 중입니다',
    selectionStripAriaLabel: '맵 선택 정보',
    selectionTargetLabel: '선택 대상',
    selectionStatusLabel: '상태',
    actionDockAriaLabel: '탐색 행동',
    actorEyebrow: isGmView ? '선택한 캐릭터' : '현재 조작 캐릭터',
    actorFallbackName: '캐릭터 미선택',
    characterStatsAriaLabel: '선택 캐릭터 주요 능력치',
    tokenStatsAriaLabel: '선택 토큰 정보',
    classLabel: '직업',
    levelLabel: '레벨',
    armorClassLabel: 'AC',
    conditionLabel: '상태',
    hpLabel: 'HP',
    movementLabel: '이동',
    tokenCoordinateLabel: '토큰 좌표',
    tokenHiddenLabel: '플레이어 비공개',
    tokenVisibleLabel: '플레이어 공개',
    tokenTypeLabel: '유형',
    tokenSizeLabel: '크기',
    tokenGridLabel: '좌표',
    tokenVisibilityLabel: '공개',
    tokenHiddenValueLabel: '숨김',
    tokenVisibleValueLabel: '공개',
    nonCharacterTokenInventoryNote: 'NPC와 몬스터 토큰은 현재 인벤토리 대신 지도 상태만 표시합니다.',
    noActorInstructionText: '지도에서 위치를 확인하고 메인 명령으로 행동을 선언하세요.',
    actionPanelEyebrow: '선택 대상 행동',
    shortRestLabel: '짧은 휴식',
    shortRestHitDiceAriaLabel: '짧은 휴식 히트 다이스 사용 수',
    longRestLabel: '긴 휴식',
    gmObjectPickupReadonlyTitle: 'GM 화면에서는 맵 오브젝트를 조회만 합니다.',
    mapObjectPickupTitle: (targetLabel: string) => `${targetLabel} 줍기`,
    mapObjectPickupLabel: '줍기',
    inventoryEyebrow: '인벤토리',
    grantInventoryTitle: (characterName: string) => `${characterName}에게 아이템 지급`,
    grantInventoryLabel: '지급',
    inventoryToggleTitle: isInventoryExpanded ? '인벤토리 접기' : '인벤토리 펼치기',
    inventoryItemsHeading: '보유 아이템',
    inventoryReadonlyTitle: 'GM 화면에서는 선택 캐릭터의 인벤토리를 조회만 합니다.',
    armorAppliedTitle: '몸통 방어구는 현재 캐릭터 AC에 반영되어 있습니다.',
    unequipItemTitle: (itemName: string) => `${itemName} 착용 해제`,
    equipItemTitle: (itemName: string) => `${itemName} 착용`,
    unequipLabel: '해제',
    equipLabel: '착용',
    equippedDropBlockedTitle: '착용 중인 아이템은 해제 후 내려놓을 수 있습니다.',
    dropTileRequiredTitle: '내려놓을 맵 타일을 먼저 선택하세요.',
    dropItemTitle: (itemName: string) => `${itemName} 내려놓기`,
    dropItemLabel: '내려놓기',
    useItemTitle: (itemName: string) => `${itemName} 사용`,
    unusableItemTitle: '현재 바로 사용할 수 없는 아이템입니다.',
    useItemLabel: '사용',
    inventoryEmptyText: '보유 중인 아이템이 없습니다.',
    gmItemPickerEyebrow: '아이템 지급',
    gmItemPickerCloseTitle: '닫기',
    gmItemSearchLabel: '아이템 검색',
    gmItemSearchPlaceholder: '이름, 키, 분류',
    gmItemLoadingText: '아이템 목록을 불러오는 중입니다.',
    gmItemEmptyText: '검색 결과가 없습니다.',
    gmItemQuantityLabel: '수량',
    gmItemGrantSubmitLabel: isGmInventoryGrantPending ? '지급 중' : '지급',
    gmPanelAriaLabel: 'GM 탐색 제어',
    gmPanelToggleLabel: isGmPanelCollapsed ? 'GM 패널 열기' : 'GM 패널 접기',
    gmMapStatusEyebrow: 'GM 지도 상태',
    gmHiddenTokensLabel: '숨김 토큰',
    gmHiddenObjectsLabel: '비공개 오브젝트',
    gmHazardsLabel: '활성 위험',
    gmLockedDoorsLabel: '잠긴 문',
    gmFogRectsLabel: '안개 영역',
    gmSelectionInspectorEyebrow: '선택 대상 인스펙터',
    gmMessageEyebrow: '장면/NPC 전송',
    gmNpcMessageLabel: 'NPC 대사로 전송',
    gmSpeakerPlaceholder: '화자 이름',
    gmMessagePlaceholder: isGmNpcMessage
      ? 'NPC 대사를 입력하세요.'
      : '플레이어에게 공개할 장면 묘사를 입력하세요.',
    gmPrivateNotePlaceholder: '비공개 GM 메모',
    gmSubmitLabel: isGmMessagePending ? '전송 중' : '전송',
    gmControlsEyebrow: 'GM 조작',
    gmToggleTokenHiddenLabel: '토큰 공개/숨김',
    gmToggleObjectVisibleLabel: '오브젝트 공개/숨김',
    gmTriggerObjectLabel: '이벤트 발동',
    gmRevealFogAtSelectionLabel: '주변 공개',
    gmRevealAllFogLabel: '전체 공개',
    gmNodeMoveEyebrow: '장면 이동',
    gmDefaultMoveSuffix: ' · 기본 이동',
    gmNodeMoveEmptyText: '현재 노드에서 바로 이동 가능한 노드가 없습니다.',
    gmMapNotReadyFeedback: '맵을 아직 불러오지 못했습니다.',
    gmRevealAllFogFeedback: '전체 안개를 공개 상태로 변경했습니다.',
    gmSelectionRequiredFeedback: '먼저 GM이 조작할 맵 요소를 선택해 주세요.',
    gmRevealFogAtSelectionFeedback: '선택 지점 주변의 안개를 공개했습니다.',
    gmTokenVisibleFeedback: '선택 토큰을 플레이어에게 공개했습니다.',
    gmTokenHiddenFeedback: '선택 토큰을 숨김 처리했습니다.',
    gmObjectVisibleFeedback: '선택 오브젝트를 플레이어에게 공개했습니다.',
    gmObjectHiddenFeedback: '선택 오브젝트를 플레이어에게 비공개 처리했습니다.',
    gmObjectEventMissingFeedback: '선택한 오브젝트에 등록된 이벤트가 없습니다.',
    gmMapInteractionUnavailableFeedback: '맵 상호작용을 처리할 수 없습니다.',
    gmObjectEventFailureFeedback: '오브젝트 이벤트를 처리하지 못했습니다.',
    gmUnsupportedActionFeedback: '선택 대상에 사용할 수 없는 GM 조작입니다.',
    localSelectionRequiredFeedback: '먼저 맵 타일이나 대상을 선택해 주세요.',
    localPingSuccessFeedback: '선택한 위치에 핑을 찍었습니다.',
    localPingFailureFeedback: '핑을 찍지 못했습니다.',
    localDoorUnlockedFeedback: '선택한 문의 잠금을 해제했습니다.',
    localDoorStateChangedFeedback: (doorStateLabel: string) =>
      `선택한 문의 상태를 ${doorStateLabel}으로 변경했습니다.`,
    localHazardDisarmedFeedback: '선택한 위험 요소를 판정 없이 해제했습니다.',
    localObjectBrokenFeedback: '선택한 오브젝트를 파괴 상태로 변경했습니다.',
    localGmInspectWithoutCheckFeedback: 'GM은 판정 없이 선택한 대상 정보를 확인합니다.',
    localMapInteractionFailureFeedback: '맵 상호작용을 처리하지 못했습니다.',
    localControlledTokenMissingFeedback: '이동할 내 캐릭터 토큰이 맵에 없습니다.',
    localPathUnavailableFeedback: '해당 타일까지 이동 가능한 경로가 없습니다.',
    localTokenMoveSuccessFeedback: (tokenName: string) =>
      `${tokenName} 토큰을 선택한 타일로 이동했습니다.`,
    localTokenMoveFailureFeedback: (tokenName: string) => `${tokenName} 토큰을 이동하지 못했습니다.`,
  };
}
