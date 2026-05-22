import type { ScenarioAssetResponseDto, SrdMonsterReferenceDto, VttMapStateDto } from '@trpg/shared-types';

type MapToken = VttMapStateDto['tokens'][number];

interface BattleMapTokenInspectorProps {
  token: MapToken;
  tokenAssets: ScenarioAssetResponseDto[];
  tokenAssetsLoading: boolean;
  tokenAssetsError: string | null;
  tokenAssetUploadBusy: boolean;
  canUploadTokenAsset: boolean;
  labels: {
    token: string;
    close: string;
    name: string;
    imageUrl: string;
    size: string;
    hidden: string;
    hostile: string;
    fixedEncounterToken: string;
    scalingPriority: string;
    srdMonster: string;
    speed: string;
    senses: string;
    languages: string;
    traits: string;
    actions: string;
    legendaryActions: string;
    duplicate: string;
    front: string;
    back: string;
    deleteToken: string;
  };
  onClose: () => void;
  onUpdate: (tokenId: string, patch: Partial<MapToken>) => void;
  onDuplicate: (tokenId: string) => void;
  onMoveLayer: (tokenId: string, direction: 'front' | 'back') => void;
  onDelete: (tokenId: string) => void;
  onApplyTokenAsset: (asset: ScenarioAssetResponseDto) => void;
  onTokenAssetFile: (file: File | null) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMonsterDisplayName(monster: SrdMonsterReferenceDto) {
  return monster.nameKo?.trim() || monster.nameEn;
}

export function BattleMapTokenInspector({
  token,
  tokenAssets,
  tokenAssetsLoading,
  tokenAssetsError,
  tokenAssetUploadBusy,
  canUploadTokenAsset,
  labels,
  onClose,
  onUpdate,
  onDuplicate,
  onMoveLayer,
  onDelete,
  onApplyTokenAsset,
  onTokenAssetFile,
}: BattleMapTokenInspectorProps) {
  const showsAssetLibrary =
    canUploadTokenAsset || tokenAssets.length > 0 || tokenAssetsLoading || Boolean(tokenAssetsError);

  return (
    <aside className="vtt-inspector">
      <div className="vtt-inspector-head">
        <span className="eyebrow">{labels.token}</span>
        <button type="button" onClick={onClose}>
          {labels.close}
        </button>
      </div>
      <label>
        {labels.name}
        <input value={token.name} onChange={(event) => onUpdate(token.id, { name: event.target.value })} />
      </label>
      <label>
        {labels.imageUrl}
        <input
          value={token.imageUrl ?? ''}
          onChange={(event) => onUpdate(token.id, { imageUrl: event.target.value || null })}
        />
      </label>
      {showsAssetLibrary ? (
        <div className="vtt-asset-library">
          <div className="vtt-asset-library-head">
            <div>
              <span className="eyebrow">Token library</span>
              <strong>업로드한 토큰 이미지를 현재 토큰에 바로 적용할 수 있습니다.</strong>
            </div>
            {canUploadTokenAsset ? (
              <label
                className={`vtt-asset-upload${tokenAssetUploadBusy ? ' disabled' : ''}`}
                aria-disabled={tokenAssetUploadBusy}
              >
                <input
                  type="file"
                  accept="image/*"
                  disabled={tokenAssetUploadBusy}
                  onChange={(event) => {
                    onTokenAssetFile(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                />
                {tokenAssetUploadBusy ? '토큰 업로드 중..' : '토큰 업로드'}
              </label>
            ) : null}
          </div>
          {tokenAssetsError ? <p className="panel-error">{tokenAssetsError}</p> : null}
          {tokenAssetsLoading ? (
            <p className="helper-copy">토큰 자산 목록을 불러오는 중입니다.</p>
          ) : tokenAssets.length ? (
            <div className="vtt-asset-grid">
              {tokenAssets.map((asset) => {
                const isSelected = token.imageUrl === asset.publicUrl;
                return (
                  <article key={asset.id} className={`vtt-asset-card${isSelected ? ' selected' : ''}`}>
                    <img className="vtt-asset-preview" src={asset.publicUrl} alt={asset.fileName} />
                    <div className="vtt-asset-meta">
                      <strong>{asset.fileName}</strong>
                      <span>{Math.max(1, Math.round(asset.fileSizeBytes / 1024))} KB</span>
                    </div>
                    <button type="button" onClick={() => onApplyTokenAsset(asset)}>
                      {isSelected ? '현재 토큰' : '이 토큰 적용'}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="vtt-asset-empty">
              업로드한 토큰 이미지가 아직 없습니다. 자주 쓰는 말, 몬스터, NPC 토큰을 올려두면 맵 위
              토큰에 바로 재사용할 수 있습니다.
            </div>
          )}
        </div>
      ) : null}
      <div className="vtt-field-row">
        <label>
          X
          <input type="number" value={token.x} onChange={(event) => onUpdate(token.id, { x: Number(event.target.value) })} />
        </label>
        <label>
          Y
          <input type="number" value={token.y} onChange={(event) => onUpdate(token.id, { y: Number(event.target.value) })} />
        </label>
        <label>
          {labels.size}
          <input
            type="number"
            min={24}
            max={160}
            value={token.size}
            onChange={(event) => onUpdate(token.id, { size: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="vtt-check-row">
        <label>
          <input
            type="checkbox"
            checked={token.hidden === true}
            onChange={(event) => onUpdate(token.id, { hidden: event.target.checked })}
          />
          {labels.hidden}
        </label>
        <label>
          <input
            type="checkbox"
            checked={token.isHostile === true}
            onChange={(event) => onUpdate(token.id, { isHostile: event.target.checked })}
          />
          {labels.hostile}
        </label>
        {token.monster || token.isHostile ? (
          <label>
            <input
              type="checkbox"
              checked={token.encounterRole === 'fixed'}
              onChange={(event) =>
                onUpdate(token.id, {
                  encounterRole: event.target.checked ? 'fixed' : 'scalable',
                })
              }
            />
            {labels.fixedEncounterToken}
          </label>
        ) : null}
      </div>
      {token.monster || token.isHostile ? (
        <div className="vtt-field-row">
          <label>
            {labels.scalingPriority}
            <input
              type="number"
              min={0}
              max={99}
              value={token.encounterPriority ?? 0}
              onChange={(event) =>
                onUpdate(token.id, {
                  encounterPriority: clamp(Number(event.target.value), 0, 99),
                })
              }
            />
          </label>
        </div>
      ) : null}
      {token.monster ? (
        <div className="vtt-monster-card">
          <span className="eyebrow">{labels.srdMonster}</span>
          <strong>{getMonsterDisplayName(token.monster)}</strong>
          <p>{token.monster.basicRaw}</p>
          <ul className="vtt-monster-stats">
            <li>AC: {token.monster.armorClassRaw ?? '-'}</li>
            <li>HP: {token.monster.hitPointsRaw ?? '-'}</li>
            <li>
              {labels.speed}: {token.monster.speedRaw ?? '-'}
            </li>
            <li>CR: {token.monster.challengeRaw ?? '-'}</li>
          </ul>
          <p>
            {labels.senses}: {token.monster.sensesRaw ?? '-'}
          </p>
          <p>
            {labels.languages}: {token.monster.languagesRaw ?? '-'}
          </p>
          {token.monster.traits.length ? (
            <p>
              {labels.traits}: {token.monster.traits.join(', ')}
            </p>
          ) : null}
          {token.monster.actions.length ? (
            <p>
              {labels.actions}: {token.monster.actions.join(', ')}
            </p>
          ) : null}
          {token.monster.legendaryActions.length ? (
            <p>
              {labels.legendaryActions}: {token.monster.legendaryActions.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="vtt-inspector-actions">
        <button type="button" onClick={() => onDuplicate(token.id)}>
          {labels.duplicate}
        </button>
        <button type="button" onClick={() => onMoveLayer(token.id, 'front')}>
          {labels.front}
        </button>
        <button type="button" onClick={() => onMoveLayer(token.id, 'back')}>
          {labels.back}
        </button>
      </div>
      <button type="button" className="danger" onClick={() => onDelete(token.id)}>
        {labels.deleteToken}
      </button>
    </aside>
  );
}
