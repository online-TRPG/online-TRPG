/*
 * ScenarioPage
 * 역할: 내가 만든 시나리오 목록을 검색/선택/삭제/복제하고 에디터로 이동하는 라이브러리 페이지입니다.
 * 읽는 순서:
 * 1) 복제 헬퍼: 기존 시나리오의 노드/링크/단서 ID를 새 ID로 재매핑
 * 2) state: 목록, 선택된 시나리오, 검색어, 로딩/에러 상태
 * 3) useEffect: 검색어 변경 시 내 시나리오 목록을 다시 조회
 * 4) handler: 선택 시나리오 삭제, 선택 시나리오 복제
 * 5) JSX: 좌측 사이드바, 검색/목록 영역, 우측 상세 패널
 */
import { useEffect, useMemo, useState } from "react";
import plusSignImage from "../components/plussign.webp";
import quillImage from "../components/quill.webp";
import scenarioMetalFrameImage from "../components/scenario_metal_frame.webp";
import bookImage from "../components/book.webp";
import scrollImage from "../components/scroll.webp";
import scrollHorizontalImage from "../components/scroll_horizontal.webp";
import searchbarFrameImage from "../components/searchbar_gold_frame.webp";
import sidePanelImage from "../components/Side_Panel.webp";
import { Icon } from "../components/Icon";
import {
  applyScenarioModerationAction,
  createScenario,
  deleteScenario,
  forkScenario,
  getScenario,
  listScenarios,
  listMyScenarios,
  reportScenario,
  unpublishScenarioRevision,
} from "../services/api";
import type { Scenario, StoredUser } from "../types/session";
import type {
  ApplyScenarioModerationActionDto,
  CreateScenarioDto,
  ScenarioQueryDto,
} from "@trpg/shared-types";
import "./CharacterPage.css";
import "./ScenarioPage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface ScenarioPageProps {
  user: StoredUser;
  accessToken: string | null;
  busy: boolean;
  error: string | null;
  onOpenCreate: () => void;
  onOpenEdit: (scenarioId: string) => void;
  onOpenPublish: (scenarioId: string) => void;
}

// 시나리오 복제 시 기존 ID와 충돌하지 않게 로컬 ID를 만듭니다.
function makeCloneId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 복제된 노드 ID 맵을 사용해 링크/단서가 새 노드를 가리키도록 바꿉니다.
function remapNodeReference(value: unknown, nodeIdMap: Map<string, string>): string | null {
  return typeof value === "string" ? nodeIdMap.get(value) ?? value : null;
}

function formatScenarioLevel(scenario: Scenario): string {
  const maybeScenarioWithLevels = scenario as Scenario & {
    startLevel?: number | null;
    recommendedEndLevel?: number | null;
  };
  const startLevel =
    typeof maybeScenarioWithLevels.startLevel === "number" ? maybeScenarioWithLevels.startLevel : 1;
  const endLevel =
    typeof maybeScenarioWithLevels.recommendedEndLevel === "number"
      ? maybeScenarioWithLevels.recommendedEndLevel
      : null;
  return endLevel && endLevel !== startLevel ? `LV ${startLevel}-${endLevel}` : `LV ${startLevel}`;
}

function formatScenarioUpdatedAt(value: string | null | undefined): string {
  if (!value) return "--/--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function formatPublishStatus(scenario: Scenario): string {
  if (scenario.sourceType === "SYSTEM") return "기본 제공 공개 시나리오";
  if (scenario.publishStatus === "public") return `공개 revision ${scenario.revisionNumber ?? ""}`.trim();
  if (scenario.publishStatus === "link") return `링크 공개 revision ${scenario.revisionNumber ?? ""}`.trim();
  if (scenario.publishStatus === "private") return `비공개 revision ${scenario.revisionNumber ?? ""}`.trim();
  if (scenario.publishStatus === "unpublished") return `공개 취소 revision ${scenario.revisionNumber ?? ""}`.trim();
  return "draft";
}

function isScenarioModerationOperator(role: string | undefined): boolean {
  return role === "ADMIN" || role === "MODERATOR";
}

type ScenarioCardTone = "provided" | "public" | "mine" | "reported" | "hidden" | "inactive" | "removed";
type ScenarioStatusFilter = "all" | ScenarioCardTone;

function getScenarioCardState(
  scenario: Scenario,
  viewer: StoredUser,
): { label: string; tone: ScenarioCardTone; description: string } {
  if (scenario.moderationStatus === "removed") {
    return { label: "삭제 대기", tone: "removed", description: "운영자에 의해 제거 처리된 공개 시나리오" };
  }
  if (scenario.moderationStatus === "hidden") {
    return { label: "숨김", tone: "hidden", description: "신고 또는 운영자 조치로 공개 목록에서 숨겨진 시나리오" };
  }
  if (scenario.publishStatus === "unpublished") {
    return { label: "비활성", tone: "inactive", description: "공개자가 공개 취소한 공개 복사본" };
  }
  if (scenario.moderationStatus === "reported") {
    return { label: "신고됨", tone: "reported", description: "신고가 접수된 공개 시나리오" };
  }
  if (scenario.sourceType === "SYSTEM") {
    return { label: "기본 제공", tone: "provided", description: "시스템에서 기본 제공하는 공개 시나리오" };
  }
  if (scenario.publishedByUserId === viewer.id || scenario.createdByUserId === viewer.id) {
    return { label: "내 공개", tone: "mine", description: "내가 공개한 시나리오" };
  }
  return { label: "공개", tone: "public", description: "활성 상태의 공개 시나리오" };
}

function buildPublicScenarioQuery(
  searchTerm: string,
  publicSort: NonNullable<ScenarioQueryDto["sort"]>,
  publicTag: string,
  publicMinLevel: string,
  publicMaxLevel: string,
): ScenarioQueryDto {
  return {
    search: searchTerm.trim() || undefined,
    sort: publicSort,
    tag: publicTag.trim() || undefined,
    minLevel: publicMinLevel ? Number(publicMinLevel) : undefined,
    maxLevel: publicMaxLevel ? Number(publicMaxLevel) : undefined,
    limit: 50,
  };
}

function getScenarioStatusFilterOptions(
  canModeratePublicScenarios: boolean,
): Array<{ value: ScenarioStatusFilter; label: string }> {
  return canModeratePublicScenarios
    ? [
        { value: "all", label: "전체" },
        { value: "provided", label: "기본 제공" },
        { value: "public", label: "정상 공개" },
        { value: "mine", label: "내 공개" },
        { value: "reported", label: "신고됨" },
        { value: "hidden", label: "숨김" },
        { value: "inactive", label: "비활성" },
        { value: "removed", label: "삭제 대기" },
      ]
    : [
        { value: "all", label: "전체" },
        { value: "provided", label: "기본 제공" },
        { value: "public", label: "공개" },
        { value: "mine", label: "내 공개" },
      ];
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function ScenarioPage({
  user,
  accessToken,
  busy,
  error,
  onOpenCreate,
  onOpenEdit,
  onOpenPublish,
}: ScenarioPageProps) {
  // 목록/선택/검색/로딩 상태입니다.
  const [activeLibrary, setActiveLibrary] = useState<"my" | "public">("my");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [publicScenarios, setPublicScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [publicSort, setPublicSort] = useState<NonNullable<ScenarioQueryDto["sort"]>>("recommended");
  const [publicTag, setPublicTag] = useState("");
  const [publicMinLevel, setPublicMinLevel] = useState("");
  const [publicMaxLevel, setPublicMaxLevel] = useState("");
  const [publicStatusFilter, setPublicStatusFilter] = useState<ScenarioStatusFilter>("all");
  const [moderationFeedback, setModerationFeedback] = useState<string | null>(null);
  const [operatorActionBusy, setOperatorActionBusy] = useState(false);
  const [operatorActionError, setOperatorActionError] = useState<string | null>(null);
  const [publicFeedback, setPublicFeedback] = useState<string | null>(null);

  // 검색어가 바뀌면 짧은 debounce 후 내 시나리오 목록을 다시 불러옵니다.
  useEffect(() => {
    let ignore = false;
    setLocalError(null);
    setLocalBusy(true);

    const timer = window.setTimeout(() => {
      listMyScenarios(user, accessToken, searchTerm)
      .then((next) => {
        if (ignore) return;
        setScenarios(next);
        if (activeLibrary === "my") {
          setSelectedScenarioId((current) =>
            next.some((scenario) => scenario.id === current) ? current : next[0]?.id ?? null
          );
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setLocalError(caught instanceof Error ? caught.message : "시나리오 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLocalBusy(false);
        }
      });
    }, 250);
  return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, activeLibrary, searchTerm, user]);

  useEffect(() => {
    let ignore = false;
    setLocalError(null);
    setLocalBusy(true);

    const timer = window.setTimeout(() => {
      const query = buildPublicScenarioQuery(searchTerm, publicSort, publicTag, publicMinLevel, publicMaxLevel);
      listScenarios(query, user, accessToken)
        .then((next) => {
          if (ignore) return;
          setPublicScenarios(next);
          if (activeLibrary === "public") {
            setSelectedScenarioId((current) =>
              next.some((scenario) => scenario.id === current) ? current : next[0]?.id ?? null,
            );
          }
        })
        .catch((caught) => {
          if (!ignore) {
            setLocalError(caught instanceof Error ? caught.message : "공개 시나리오 목록을 불러오지 못했습니다.");
          }
        })
        .finally(() => {
          if (!ignore) {
            setLocalBusy(false);
          }
        });
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, activeLibrary, publicMaxLevel, publicMinLevel, publicSort, publicTag, searchTerm, user]);

  useEffect(() => {
    const source =
      activeLibrary === "public" && publicStatusFilter !== "all"
        ? publicScenarios.filter((scenario) => getScenarioCardState(scenario, user).tone === publicStatusFilter)
        : activeLibrary === "public"
          ? publicScenarios
          : scenarios;
    setSelectedScenarioId((current) =>
      source.some((scenario) => scenario.id === current) ? current : source[0]?.id ?? null,
    );
  }, [activeLibrary, publicScenarios, publicStatusFilter, scenarios, user]);

  // 현재 카드 목록에서 선택된 시나리오입니다. 오른쪽 상세 패널에 표시됩니다.
  const canModeratePublicScenarios = isScenarioModerationOperator(user.role);
  const statusFilterOptions = getScenarioStatusFilterOptions(canModeratePublicScenarios);
  const publicStatusCounts = useMemo(() => {
    const counts: Record<ScenarioStatusFilter, number> = {
      all: publicScenarios.length,
      provided: 0,
      public: 0,
      mine: 0,
      reported: 0,
      hidden: 0,
      inactive: 0,
      removed: 0,
    };
    for (const scenario of publicScenarios) {
      counts[getScenarioCardState(scenario, user).tone] += 1;
    }
    return counts;
  }, [publicScenarios, user]);
  const visibleScenarios = useMemo(() => {
    if (activeLibrary !== "public" || publicStatusFilter === "all") {
      return activeLibrary === "public" ? publicScenarios : scenarios;
    }
    return publicScenarios.filter((scenario) => getScenarioCardState(scenario, user).tone === publicStatusFilter);
  }, [activeLibrary, publicScenarios, publicStatusFilter, scenarios, user]);
  const selectedScenario = useMemo(
    () => visibleScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [selectedScenarioId, visibleScenarios],
  );
  // 선택한 시나리오 삭제 버튼 동작입니다.
  async function handleDeleteSelected() {
    if (!selectedScenario) return;
    const confirmed = window.confirm(`${selectedScenario.title} 시나리오를 삭제할까요?`);
    if (!confirmed) return;

    setLocalBusy(true);
    setLocalError(null);

    try {
      await deleteScenario(user, selectedScenario.id, accessToken);
      setScenarios((current) => {
        const next = current.filter((scenario) => scenario.id !== selectedScenario.id);
        setSelectedScenarioId(next[0]?.id ?? null);
        return next;
      });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "시나리오 삭제에 실패했습니다.");
    } finally {
      setLocalBusy(false);
    }
  }

  // 선택한 시나리오를 전체 복제합니다. 노드/링크/단서 ID를 전부 새로 매핑합니다.
  async function handleCloneSelected() {
    if (!selectedScenario) return;

    setLocalBusy(true);
    setLocalError(null);

    try {
      const source = await getScenario(selectedScenario.id, user, accessToken);
      const nodeIdMap = new Map(source.nodes.map((node) => [node.id, makeCloneId("node")]));
      const nodes = source.nodes.map((node) => ({
        id: nodeIdMap.get(node.id) ?? makeCloneId("node"),
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        imageUrl: node.imageUrl,
        vttMap: node.vttMap
          ? {
              ...node.vttMap,
              id: `map:${nodeIdMap.get(node.id) ?? makeCloneId("node")}`,
              scenarioNodeId: nodeIdMap.get(node.id) ?? null,
            }
          : null,
        checkOptions: (node.checkOptions ?? []).map((option) => ({
          ...option,
          id: makeCloneId("check"),
        })),
        transitions: node.transitions.map((transition) => ({
          ...transition,
          id: makeCloneId("link"),
          nextNodeId: remapNodeReference(transition.nextNodeId, nodeIdMap),
        })),
        clues: node.clues.map((clue) => ({
          ...clue,
          id: makeCloneId("clue"),
          pointsToNodeId: remapNodeReference(clue.pointsToNodeId, nodeIdMap),
        })),
      }));
      const startNodeId = remapNodeReference(source.startNodeId, nodeIdMap);
      const startNode = nodes.find((node) => node.id === startNodeId) ?? nodes[0];
      const copyTitle = `${source.title} 복사본`.slice(0, 100);
      const payload: CreateScenarioDto = {
        title: copyTitle,
        description: source.description,
        thumbnailUrl: source.thumbnailUrl,
        ruleSetId: source.ruleSetId,
        difficulty: source.difficulty,
        startLevel: source.startLevel ?? 1,
        recommendedEndLevel: source.recommendedEndLevel,
        license: source.license,
        attribution: source.attribution,
        startNodeId,
        startNodeTitle: startNode?.title,
        startSceneText: startNode?.sceneText,
        nodes,
        npcs: source.npcs,
      };

      const created = await createScenario(user, payload, accessToken);
      const next = await listMyScenarios(user, accessToken, searchTerm);
      setScenarios(next);
      setSelectedScenarioId(next.some((scenario) => scenario.id === created.id) ? created.id : next[0]?.id ?? null);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "시나리오 복제에 실패했습니다.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function handleUnpublishSelected() {
    if (!selectedScenario) return;
    const confirmed = window.confirm(`${selectedScenario.title} revision을 공개 취소할까요? 기존 세션 snapshot은 유지됩니다.`);
    if (!confirmed) return;

    setLocalBusy(true);
    setLocalError(null);
    try {
      await unpublishScenarioRevision(user, selectedScenario.id, accessToken);
      const next = await listMyScenarios(user, accessToken, searchTerm);
      const nextPublic = await listScenarios(
        buildPublicScenarioQuery(searchTerm, publicSort, publicTag, publicMinLevel, publicMaxLevel),
        user,
        accessToken,
      );
      setScenarios(next);
      setPublicScenarios(nextPublic);
      const nextVisible = activeLibrary === "public" ? nextPublic : next;
      setSelectedScenarioId(
        nextVisible.some((scenario) => scenario.id === selectedScenario.id)
          ? selectedScenario.id
          : nextVisible[0]?.id ?? null,
      );
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "시나리오 공개 취소에 실패했습니다.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function handleReportSelected() {
    if (!selectedScenario || !selectedCanReport) return;
    const reasonInput = window.prompt(
      "신고 사유를 입력하세요: copyright, private_data, license, unsafe_content, other",
      "copyright",
    );
    if (!reasonInput) return;
    const reason =
      reasonInput === "copyright" ||
      reasonInput === "private_data" ||
      reasonInput === "license" ||
      reasonInput === "unsafe_content"
        ? reasonInput
        : "other";
    const comment = window.prompt("신고 내용을 입력하세요.", "") ?? "";
    setLocalBusy(true);
    setModerationFeedback(null);
    try {
      await reportScenario(user, selectedScenario.id, { reason, comment: comment.trim() || null }, accessToken);
      const nextPublic = await listScenarios(
        buildPublicScenarioQuery(searchTerm, publicSort, publicTag, publicMinLevel, publicMaxLevel),
        user,
        accessToken,
      );
      setPublicScenarios(nextPublic);
      if (!nextPublic.some((scenario) => scenario.id === selectedScenario.id)) {
        setSelectedScenarioId(nextPublic[0]?.id ?? null);
      }
      setModerationFeedback("신고가 접수되었습니다.");
    } catch (caught) {
      setModerationFeedback(caught instanceof Error ? caught.message : "신고 접수에 실패했습니다.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function handleApplySelectedModerationAction(action: ApplyScenarioModerationActionDto["action"]) {
    if (!selectedScenario) return;
    const reason = window.prompt("처리 사유를 입력하세요.", "") ?? "";
    if (!reason.trim()) return;

    setOperatorActionBusy(true);
    setOperatorActionError(null);
    try {
      const result = await applyScenarioModerationAction(
        user,
        selectedScenario.id,
        {
          action,
          reason: reason.trim(),
          targetUserId: null,
        },
        accessToken,
      );
      setModerationFeedback(
        `${result.scenarioId} 처리 완료: ${result.action} → ${result.moderationStatus}/${result.processingStatus}`,
      );
      const nextPublic = await listScenarios(
        buildPublicScenarioQuery(searchTerm, publicSort, publicTag, publicMinLevel, publicMaxLevel),
        user,
        accessToken,
      );
      setPublicScenarios(nextPublic);
    } catch (caught) {
      setOperatorActionError(caught instanceof Error ? caught.message : "moderation 처리에 실패했습니다.");
    } finally {
      setOperatorActionBusy(false);
    }
  }

  async function handleForkSelected() {
    if (!selectedScenario || !selectedCanFork) {
      setPublicFeedback("작성자가 이 공개 시나리오의 fork를 허용하지 않았습니다.");
      return;
    }
    const title = window.prompt("fork draft 제목을 입력하세요.", `${selectedScenario.title} Fork`) ?? "";
    setLocalBusy(true);
    setLocalError(null);
    setPublicFeedback(null);
    try {
      const created = await forkScenario(
        user,
        selectedScenario.id,
        { title: title.trim() || null },
        accessToken,
      );
      const nextMine = await listMyScenarios(user, accessToken, "");
      const nextPublic = await listScenarios(
        buildPublicScenarioQuery(searchTerm, publicSort, publicTag, publicMinLevel, publicMaxLevel),
        user,
        accessToken,
      );
      setScenarios(nextMine);
      setPublicScenarios(nextPublic);
      setActiveLibrary("my");
      setSearchTerm("");
      setSelectedScenarioId(nextMine.some((scenario) => scenario.id === created.id) ? created.id : nextMine[0]?.id ?? null);
      setPublicFeedback("공개 revision을 독립 draft로 fork했습니다.");
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "fork 생성에 실패했습니다.");
    } finally {
      setLocalBusy(false);
    }
  }

  const disabled = busy || localBusy;
  const selectedIsRevision = selectedScenario?.sourceType === "CLONED" || Boolean(selectedScenario?.baseScenarioId);
  const selectedCanUnpublish = selectedScenario?.viewerCapabilities?.canUnpublish === true;
  const selectedCanFork = selectedScenario?.viewerCapabilities?.canFork === true;
  const selectedCanReport = selectedScenario?.viewerCapabilities?.canReport === true;
  const selectedIsOwnPublishedRevision = selectedCanUnpublish;

  return (
    <main
      className="character-page fantasy-character-page scenario-page"
      style={{
        ["--scenario-side-panel-image" as string]: `url(${sidePanelImage})`,
        ["--scenario-scroll-image" as string]: `url(${scrollImage})`,
        ["--scenario-scroll-horizontal-image" as string]: `url(${scrollHorizontalImage})`,
        ["--scenario-search-frame-image" as string]: `url(${searchbarFrameImage})`,
        ["--scenario-card-frame-image" as string]: `url(${scenarioMetalFrameImage})`,
        ["--scenario-book-image" as string]: `url(${bookImage})`,
      }}
    >
      <section className="scenario-management-layout">
        <aside className="scenario-action-rail">
          <div className="scenario-action-rail-shell">
            {activeLibrary === "my" ? (
              <>
                <button type="button" className="scenario-rail-action" onClick={onOpenCreate}>
                  새 시나리오 생성
                </button>
                <button
                  type="button"
                  className="scenario-rail-action"
                  disabled={!selectedScenario || disabled}
                  onClick={() => void handleCloneSelected()}
                >
                  시나리오 복제
                </button>
                <button
                  type="button"
                  className="scenario-rail-action"
                  disabled={!selectedScenario || selectedIsRevision || disabled}
                  onClick={() => selectedScenario && onOpenEdit(selectedScenario.id)}
                >
                  시나리오 수정
                </button>
                <button
                  type="button"
                  className="scenario-rail-action"
                  disabled={!selectedScenario || selectedIsRevision || disabled}
                  onClick={() => selectedScenario && onOpenPublish(selectedScenario.id)}
                >
                  공개 등록
                </button>
                <button
                  type="button"
                  className="scenario-rail-action"
                  disabled={!selectedScenario || disabled}
                  onClick={() => void handleDeleteSelected()}
                >
                  시나리오 삭제
                </button>
              </>
            ) : (
              <>
                {selectedIsOwnPublishedRevision ? (
                  <button
                    type="button"
                    className="scenario-rail-action"
                    disabled={!selectedCanUnpublish || disabled}
                    onClick={() => void handleUnpublishSelected()}
                  >
                    공개 취소
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="scenario-rail-action"
                      disabled={!selectedCanFork || disabled}
                      onClick={() => void handleForkSelected()}
                    >
                      Fork해서 가져오기
                    </button>
                    <button
                      type="button"
                      className="scenario-rail-action"
                      disabled={!selectedCanReport || disabled}
                      onClick={() => void handleReportSelected()}
                    >
                      신고
                    </button>
                  </>
                )}
                {canModeratePublicScenarios && selectedScenario ? (
                  <div className="scenario-operator-actions" aria-label="운영자 공개 시나리오 처리">
                    <button
                      type="button"
                      className="scenario-rail-action"
                      disabled={disabled || operatorActionBusy || selectedScenario.moderationStatus === "hidden"}
                      onClick={() => void handleApplySelectedModerationAction("hidden")}
                    >
                      숨김 처리
                    </button>
                    <button
                      type="button"
                      className="scenario-rail-action"
                      disabled={
                        disabled ||
                        operatorActionBusy ||
                        (selectedScenario.moderationStatus === "visible" &&
                          selectedScenario.publishStatus !== "unpublished")
                      }
                      onClick={() => void handleApplySelectedModerationAction("restored")}
                    >
                      다시 활성화
                    </button>
                    <button
                      type="button"
                      className="scenario-rail-action"
                      disabled={disabled || operatorActionBusy || selectedScenario.moderationStatus === "removed"}
                      onClick={() => void handleApplySelectedModerationAction("removed")}
                    >
                      삭제 대기
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </aside>

        {/* 중앙 보드: 검색과 시나리오 카드 목록입니다. */}
        <section className="scenario-library-stage">
          <div className="scenario-library-board">
            <img className="scenario-library-quill" src={quillImage} alt="" aria-hidden="true" />
            <div className="scenario-library-heading">
              <span className="eyebrow">Scenario library</span>
              <h1>{activeLibrary === "public" ? "공개 시나리오 탐색" : "내 시나리오"}</h1>
              <div className="scenario-library-tabs">
                <button
                  type="button"
                  className={activeLibrary === "my" ? "active" : ""}
                  onClick={() => setActiveLibrary("my")}
                >
                  내 시나리오
                </button>
                <button
                  type="button"
                  className={activeLibrary === "public" ? "active" : ""}
                  onClick={() => setActiveLibrary("public")}
                >
                  공개 탐색
                </button>
              </div>
            </div>

            <label className="scenario-library-search" htmlFor="scenario-title-search">
              <Icon name="search" />
              <input
                id="scenario-title-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="시나리오 제목 검색"
              />
            </label>
            {activeLibrary === "public" ? (
              <>
                <div className="scenario-public-filters" aria-label="공개 시나리오 필터">
                  <select value={publicSort} onChange={(event) => setPublicSort(event.target.value as typeof publicSort)}>
                    <option value="recommended">추천순</option>
                    <option value="latest">최신순</option>
                    <option value="level">레벨순</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={publicMinLevel}
                    onChange={(event) => setPublicMinLevel(event.target.value)}
                    placeholder="최소 레벨"
                  />
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={publicMaxLevel}
                    onChange={(event) => setPublicMaxLevel(event.target.value)}
                    placeholder="최대 레벨"
                  />
                  <input
                    type="text"
                    value={publicTag}
                    onChange={(event) => setPublicTag(event.target.value)}
                    placeholder="태그"
                  />
                </div>
                <div className="scenario-status-filter-chips" aria-label="공개 시나리오 상태 필터">
                  {statusFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={publicStatusFilter === option.value ? "active" : ""}
                      onClick={() => setPublicStatusFilter(option.value)}
                    >
                      {option.label}
                      <span>{publicStatusCounts[option.value]}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="scenario-library-grid">
              {visibleScenarios.length === 0 ? (
                <p className="scenario-library-empty">조건에 맞는 시나리오가 없습니다.</p>
              ) : null}
              {visibleScenarios.map((scenario) => {
                const cardState = getScenarioCardState(scenario, user);
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    className={`scenario-library-card scenario-library-card-${cardState.tone}${scenario.id === selectedScenarioId ? " selected" : ""}`}
                    onClick={() => setSelectedScenarioId(scenario.id)}
                    title={cardState.description}
                  >
                    <span className="scenario-card-status-badge">{cardState.label}</span>
                    <strong>{scenario.title}</strong>
                    <span className="scenario-card-status-description">{cardState.description}</span>
                    <span>{formatPublishStatus(scenario)}</span>
                    {activeLibrary === "public" ? (
                      <span className="scenario-library-updated-at">
                        fork {scenario.forkCount ?? 0}
                      </span>
                    ) : null}
                    <span className="scenario-library-updated-at">
                      마지막 업데이트 날짜 : {formatScenarioUpdatedAt(scenario.updatedAt)}
                    </span>
                  </button>
                );
              })}

              {activeLibrary === "my" ? (
                <button
                  type="button"
                  className="scenario-library-card scenario-library-card-create"
                  onClick={onOpenCreate}
                >
                  <img src={plusSignImage} alt="" aria-hidden="true" />
                  <strong>+ 새 시나리오 만들기</strong>
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* 우측 상세 패널: 선택 안내와 선택된 시나리오 상세 정보입니다. */}
        <aside className="scenario-detail-stage">
          <section className="scenario-detail-note">
            <h2>시나리오 상세</h2>
            <p>왼쪽에서 시나리오를 선택하면 상세 정보와 기본 메타 정보를 확인할 수 있습니다.</p>
          </section>

          <section className="scenario-detail-panel">
            <div className="scenario-detail-panel-scroll">
              {selectedScenario ? (
                <>
                  <div className="scenario-detail-panel-heading">
                    <span className="eyebrow">Selected scenario</span>
                    <h2>{selectedScenario.title}</h2>
                  </div>
                  <p>{selectedScenario.description || "시나리오 소개가 비어 있습니다."}</p>
                  <dl className="scenario-detail-meta">
                    <div>
                      <dt>레벨 / 예상 시간</dt>
                      <dd>
                        {formatScenarioLevel(selectedScenario)}
                        {selectedScenario.estimatedMinutes ? ` · ${selectedScenario.estimatedMinutes}분` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>장르 / 태그</dt>
                      <dd>{selectedScenario.tags?.length ? selectedScenario.tags.join(", ") : "-"}</dd>
                    </div>
                    <div>
                      <dt>작성자 / 공개자</dt>
                      <dd>
                        {(selectedScenario.createdByDisplayName ?? "알 수 없는 사용자")}
                        {" / "}
                        {(selectedScenario.publishedByDisplayName ?? "-")}
                      </dd>
                    </div>
                    <div>
                      <dt>공개 상태</dt>
                      <dd>{formatPublishStatus(selectedScenario)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <article className="scenario-detail-empty">
                    <h3>선택된 시나리오가 없습니다.</h3>
                    <p>중앙 보드에서 시나리오 카드를 선택하거나 새 시나리오를 생성해 주세요.</p>
                  </article>
                </>
              )}
            </div>
          </section>
        </aside>
      </section>

      {moderationFeedback ? <p className="scenario-collaboration-error">{moderationFeedback}</p> : null}
      {operatorActionError ? <p className="scenario-collaboration-error">{operatorActionError}</p> : null}
      {publicFeedback ? <p className="scenario-library-updated-at">{publicFeedback}</p> : null}
      {localError || error ? <p className="panel-error">{localError ?? error}</p> : null}
    </main>
  );
}
