import { useMemo, useState } from "react";
import type {
  ApplySessionEconomyActionDto,
  SessionCharacterResponseDto,
} from "@trpg/shared-types";
import "./SessionEconomyPanel.css";

type EconomyStateView = {
  partyStash?: Array<{
    itemDefinitionId: string;
    quantity: number;
    identified?: boolean;
    damaged?: boolean;
    attunedBySessionCharacterId?: string | null;
    chargesRemaining?: number | null;
  }>;
  walletsBySessionCharacterId?: Record<
    string,
    { cp?: number; sp?: number; ep?: number; gp?: number; pp?: number }
  >;
  shopStatesById?: Record<
    string,
    {
      shopId: string;
      inventory: Array<{
        itemDefinitionId: string;
        quantity: number;
        priceGp: number;
      }>;
    }
  >;
  craftingProgressById?: Record<
    string,
    {
      craftingId: string;
      recipeId: string;
      sessionCharacterId: string;
      outputItemDefinitionId: string;
      completedHours: number;
      requiredHours: number;
      status: string;
    }
  >;
};

interface SessionEconomyPanelProps {
  economy: EconomyStateView | null;
  characters: SessionCharacterResponseDto[];
  isBusy: boolean;
  feedback?: string | null;
  onApply: (payload: ApplySessionEconomyActionDto) => Promise<void> | void;
}

const actionLabels: Record<ApplySessionEconomyActionDto["actionType"], string> = {
  purchase: "상점 구매",
  sell: "상점 판매",
  grant_reward: "보상 지급",
  distribute: "공동 보관함 분배",
  start_crafting: "제작 시작",
  progress_crafting: "제작 진행",
  identify: "감정",
  repair: "수리",
  attune: "조율",
  recover_charges: "충전 회복",
};

export function SessionEconomyPanel({
  economy,
  characters,
  isBusy,
  feedback,
  onApply,
}: SessionEconomyPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [actionType, setActionType] =
    useState<ApplySessionEconomyActionDto["actionType"]>("purchase");
  const [sessionCharacterId, setSessionCharacterId] = useState("");
  const [shopId, setShopId] = useState("");
  const [itemDefinitionId, setItemDefinitionId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [priceGp, setPriceGp] = useState(0);
  const [costGp, setCostGp] = useState(0);
  const [rewardGp, setRewardGp] = useState(0);
  const [craftingId, setCraftingId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [outputItemDefinitionId, setOutputItemDefinitionId] = useState("");
  const [laborHours, setLaborHours] = useState(1);
  const [toolProficiencies, setToolProficiencies] = useState("");
  const [chargesRecovered, setChargesRecovered] = useState(1);
  const [maximumCharges, setMaximumCharges] = useState(1);
  const shops = Object.values(economy?.shopStatesById ?? {});
  const craftingEntries = Object.values(economy?.craftingProgressById ?? {});
  const selectedShop = shops.find((shop) => shop.shopId === shopId) ?? null;
  const availableItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of economy?.partyStash ?? []) ids.add(item.itemDefinitionId);
    for (const item of selectedShop?.inventory ?? []) ids.add(item.itemDefinitionId);
    return [...ids].sort();
  }, [economy?.partyStash, selectedShop?.inventory]);

  function submit() {
    const base = {
      actionType,
      sessionCharacterId: sessionCharacterId || null,
      shopId: shopId || null,
      itemDefinitionId: itemDefinitionId || null,
      quantity,
      priceGp,
      costGp,
    } satisfies ApplySessionEconomyActionDto;

    const payload: ApplySessionEconomyActionDto =
      actionType === "grant_reward"
        ? {
            ...base,
            rewardId: `manual-reward-${Date.now()}`,
            currency: rewardGp > 0 ? { gp: rewardGp } : undefined,
            items: itemDefinitionId
              ? [{ itemDefinitionId, quantity, identified: true }]
              : undefined,
            splitCurrency: true,
          }
        : actionType === "start_crafting"
          ? {
              ...base,
              craftingId: craftingId || `crafting-${Date.now()}`,
              recipeId: recipeId || `recipe-${Date.now()}`,
              outputItemDefinitionId: outputItemDefinitionId || itemDefinitionId || null,
              outputQuantity: quantity,
              requiredMaterials: itemDefinitionId
                ? [{ itemDefinitionId, quantity: 1 }]
                : [],
              requiredToolProficiencies: toolProficiencies
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              knownToolProficiencies: toolProficiencies
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              laborHours,
            }
          : actionType === "progress_crafting"
            ? { ...base, craftingId: craftingId || null, laborHours }
            : actionType === "recover_charges"
              ? { ...base, chargesRecovered, maximumCharges }
              : actionType === "attune"
                ? { ...base, requiresAttunement: true }
                : base;
    void onApply(payload);
  }

  return (
    <aside className={`session-economy-panel${collapsed ? " collapsed" : ""}`}>
      <button
        type="button"
        className="session-economy-toggle"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        {collapsed ? "경제" : "경제 패널 접기"}
      </button>
      {!collapsed ? (
        <div className="session-economy-body">
          <header>
            <strong>캠페인 경제</strong>
            <span>서버 권위 상태 · 모든 변경 감사 로그 기록</span>
          </header>

          <section className="session-economy-summary">
            <div>
              <b>지갑</b>
              {characters.map((character) => {
                const wallet = economy?.walletsBySessionCharacterId?.[character.id] ?? {};
                return (
                  <span key={character.id}>
                    {character.name}: {wallet.pp ?? 0}pp {wallet.gp ?? 0}gp {wallet.sp ?? 0}sp {wallet.cp ?? 0}cp
                  </span>
                );
              })}
            </div>
            <div>
              <b>공동 보관함</b>
              {(economy?.partyStash ?? []).length ? (
                economy?.partyStash?.map((item) => (
                  <span key={`${item.itemDefinitionId}:${item.attunedBySessionCharacterId ?? ""}`}>
                    {item.itemDefinitionId} ×{item.quantity}
                    {item.identified === false ? " · 미감정" : ""}
                    {item.damaged ? " · 손상" : ""}
                    {item.chargesRemaining != null ? ` · ${item.chargesRemaining} charge` : ""}
                  </span>
                ))
              ) : (
                <span>비어 있음</span>
              )}
            </div>
            <div>
              <b>상점</b>
              {shops.length
                ? shops.map((shop) => (
                    <span key={shop.shopId}>{shop.shopId}: 재고 {shop.inventory.length}종</span>
                  ))
                : <span>등록된 상점 없음</span>}
            </div>
            <div>
              <b>제작</b>
              {craftingEntries.length
                ? craftingEntries.map((entry) => (
                    <span key={entry.craftingId}>
                      {entry.craftingId}: {entry.completedHours}/{entry.requiredHours}h · {entry.status}
                    </span>
                  ))
                : <span>진행 중인 제작 없음</span>}
            </div>
          </section>

          <section className="session-economy-form">
            <select value={actionType} onChange={(event) => setActionType(event.target.value as typeof actionType)}>
              {Object.entries(actionLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
            <select value={sessionCharacterId} onChange={(event) => setSessionCharacterId(event.target.value)}>
              <option value="">대상 캐릭터</option>
              {characters.map((character) => (
                <option value={character.id} key={character.id}>{character.name}</option>
              ))}
            </select>
            <select value={shopId} onChange={(event) => setShopId(event.target.value)}>
              <option value="">상점 선택</option>
              {shops.map((shop) => <option value={shop.shopId} key={shop.shopId}>{shop.shopId}</option>)}
            </select>
            <input
              list="session-economy-items"
              value={itemDefinitionId}
              onChange={(event) => setItemDefinitionId(event.target.value)}
              placeholder="item definition ID"
            />
            <datalist id="session-economy-items">
              {availableItemIds.map((id) => <option value={id} key={id} />)}
            </datalist>
            <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} placeholder="수량" />
            {(actionType === "sell") ? (
              <input type="number" min={0} value={priceGp} onChange={(event) => setPriceGp(Math.max(0, Number(event.target.value) || 0))} placeholder="기준 가격 gp" />
            ) : null}
            {["identify", "repair", "start_crafting"].includes(actionType) ? (
              <input type="number" min={0} value={costGp} onChange={(event) => setCostGp(Math.max(0, Number(event.target.value) || 0))} placeholder="비용 gp" />
            ) : null}
            {actionType === "grant_reward" ? (
              <input type="number" min={0} value={rewardGp} onChange={(event) => setRewardGp(Math.max(0, Number(event.target.value) || 0))} placeholder="보상 gp" />
            ) : null}
            {actionType === "start_crafting" ? (
              <>
                <input value={craftingId} onChange={(event) => setCraftingId(event.target.value)} placeholder="crafting ID (선택)" />
                <input value={recipeId} onChange={(event) => setRecipeId(event.target.value)} placeholder="recipe ID" />
                <input value={outputItemDefinitionId} onChange={(event) => setOutputItemDefinitionId(event.target.value)} placeholder="결과 item ID" />
                <input value={toolProficiencies} onChange={(event) => setToolProficiencies(event.target.value)} placeholder="도구 숙련, 쉼표 구분" />
              </>
            ) : null}
            {actionType === "progress_crafting" ? (
              <select value={craftingId} onChange={(event) => setCraftingId(event.target.value)}>
                <option value="">제작 선택</option>
                {craftingEntries.map((entry) => <option value={entry.craftingId} key={entry.craftingId}>{entry.craftingId}</option>)}
              </select>
            ) : null}
            {["start_crafting", "progress_crafting"].includes(actionType) ? (
              <input type="number" min={1} value={laborHours} onChange={(event) => setLaborHours(Math.max(1, Number(event.target.value) || 1))} placeholder="작업 시간" />
            ) : null}
            {actionType === "recover_charges" ? (
              <>
                <input type="number" min={1} value={chargesRecovered} onChange={(event) => setChargesRecovered(Math.max(1, Number(event.target.value) || 1))} placeholder="회복 charge" />
                <input type="number" min={1} value={maximumCharges} onChange={(event) => setMaximumCharges(Math.max(1, Number(event.target.value) || 1))} placeholder="최대 charge" />
              </>
            ) : null}
            <button type="button" disabled={isBusy} onClick={submit}>
              {isBusy ? "처리 중" : actionLabels[actionType]}
            </button>
          </section>
          {feedback ? <p className="session-economy-feedback">{feedback}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
