/*
 * ProfilePage
 * 역할: 내가 보는 프로필 페이지입니다. 공개 프로필에 가까운 기본 정보와 계정 관리 진입점을 보여줍니다.
 * 읽는 순서:
 * 1) ProfilePageProps: 현재 사용자, 인증 상태, 로그아웃/계정관리/닉네임 변경 콜백
 * 2) useCurrentProfile: 게스트/회원 상태를 반영한 표시용 프로필 계산
 * 3) 닉네임 편집 상태: 닉네임 표시와 변경 폼 상태
 * 4) JSX: 프로필 히어로, 기본 정보 카드, 프로필 상태 카드, 에러 표시
 */
import { FormEvent, useEffect, useMemo, useState } from "react";
import defaultArcherImage from "../assets/images/Profile_Default_Archer.webp";
import defaultRogueImage from "../assets/images/Profile_Default_Rouge.webp";
import defaultWarriorImage from "../assets/images/Profile_Default_Warrior.webp";
import defaultWizardImage from "../assets/images/Profile_Default_Wizard.webp";
import boxBulletinImage from "../components/Box_Bulletin_Rectangle.webp";
import profileBorderCharacter from "../components/Profile_Border_Character.webp";
import type { AuthMode } from "../types/auth";
import { formatDate, useCurrentProfile } from "../hooks/useCurrentProfile";
import { listMyCharacters, listMySessions } from "../services/api";
import { getClassLabel } from "../services/staticSrd";
import type { AvailableSessionListItem, PersistentCharacter, StoredUser, User } from "../types/session";
import { buildPublicProfilePath } from "../utils/routes";
import "./ProfilePage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface ProfilePageProps {
  user: StoredUser;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  onLogout: () => void;
  onOpenAccount: () => void;
  onUpdateNickname: (nickname: string) => Promise<User>;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function ProfilePage({
  user,
  accessToken,
  authMode,
  busy,
  error,
  onLogout,
  onOpenAccount,
  onUpdateNickname,
}: ProfilePageProps) {
  // 현재 로그인 방식에 따라 표시할 프로필 데이터를 계산합니다.
  const { effectiveProfile, loadingProfile, profileError, mutateProfile } = useCurrentProfile({
    user,
    accessToken,
    authMode,
  });
  const canEditNickname = authMode === "member" && Boolean(accessToken);
  const nickname = effectiveProfile.nickname || effectiveProfile.displayName || "-";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname === "-" ? "" : nickname);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [myCharacters, setMyCharacters] = useState<PersistentCharacter[]>([]);
  const [mySessions, setMySessions] = useState<AvailableSessionListItem[]>([]);
  const [totalSessionCount, setTotalSessionCount] = useState(0);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(nickname === "-" ? "" : nickname);
    }
  }, [editing, nickname]);

  useEffect(() => {
    if (!accessToken || authMode !== "member") {
      setMyCharacters([]);
      setMySessions([]);
      setTotalSessionCount(0);
      setActivityError(null);
      return;
    }

    let cancelled = false;
    setLoadingActivity(true);
    setActivityError(null);

    void Promise.all([listMyCharacters(user, accessToken), listMySessions(user, accessToken)])
      .then(([characters, sessions]) => {
        if (cancelled) return;
        setMyCharacters(characters);
        setMySessions(sessions.content);
        setTotalSessionCount(sessions.totalElements);
      })
      .catch((caught) => {
        if (cancelled) return;
        setActivityError(caught instanceof Error ? caught.message : "프로필 활동 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingActivity(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, authMode, user]);

  function startEditing() {
    setEditError(null);
    setDraft(nickname === "-" ? "" : nickname);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditError(null);
    setDraft(nickname === "-" ? "" : nickname);
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed === nickname) {
      setEditing(false);
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 10) {
      setEditError("닉네임은 2자 이상 10자 이하여야 합니다.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const updated = await onUpdateNickname(trimmed);
      mutateProfile(updated);
      setEditing(false);
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : "닉네임 변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // 닉네임과 무관한 부가 프로필 정보만 반복 출력해 이름 계열 필드가 중복 노출되지 않게 합니다.
  const profileRows = [
    { label: "프로필 주소", value: buildPublicProfilePath(effectiveProfile) },
    { label: "대표 상태", value: authMode === "guest" ? "게스트 프로필" : "회원 프로필" },
    { label: "가입일", value: formatDate(effectiveProfile.createdAt) },
  ];

  const recentCharacters = useMemo(() => {
    return [...myCharacters]
      .sort((left, right) => {
        const leftPinned = left.activeSessionId ? 1 : 0;
        const rightPinned = right.activeSessionId ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })
      .slice(0, 3);
  }, [myCharacters]);

  const lastActivityAt = useMemo(() => {
    const candidates = [effectiveProfile.createdAt, ...myCharacters.map((character) => character.updatedAt)].filter(Boolean);
    if (candidates.length === 0) return null;
    return candidates.reduce((latest, current) =>
      new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
    );
  }, [effectiveProfile.createdAt, myCharacters]);

  const recentSessionRows = useMemo(() => mySessions.slice(0, 3), [mySessions]);

  const statRows = [
    { label: "보유 캐릭터", value: `${myCharacters.length}개` },
    { label: "참여 세션", value: `${totalSessionCount}회` },
    { label: "마지막 활동", value: lastActivityAt ? formatCompactDate(lastActivityAt) : "-" },
  ];

  return (
    <main
      className="profile-page"
      style={{ ["--profile-panel-frame-image" as string]: `url(${boxBulletinImage})` }}
    >
      {/* 프로필 대표 정보와 계정 관리/로그아웃 버튼 영역입니다. */}
      <section className="profile-hero profile-framed-card">
        <div className="profile-hero-main">
          <span className="eyebrow">Profile</span>
          <div className="profile-hero-header">
            <div className="avatar avatar-xl">{nickname.slice(0, 1)}</div>
            <div>
              <h1>{nickname}</h1>
              <p>{authMode === "guest" ? "게스트 세션" : "공개 프로필"}</p>
              <div className="profile-hero-meta">
                <span>{authMode === "guest" ? "게스트 프로필" : "회원 프로필"}</span>
                <span>가입일 {formatCompactDate(effectiveProfile.createdAt)}</span>
                <span>{buildPublicProfilePath(effectiveProfile)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions profile-hero-actions-stack">
          <button type="button" className="ghost" onClick={onOpenAccount}>
            계정 관리
          </button>
          <button type="button" className="ghost" onClick={onLogout} disabled={busy}>
            로그아웃
          </button>
        </div>
      </section>

      <section className="profile-showcase-grid">
        <article className="profile-card profile-framed-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Characters</span>
              <h2>최근 사용 캐릭터</h2>
            </div>
          </div>

          {loadingActivity ? (
            <p className="profile-empty">최근 캐릭터 정보를 불러오는 중입니다.</p>
          ) : recentCharacters.length > 0 ? (
            <div className="profile-character-grid">
              {recentCharacters.map((character) => (
                <article key={character.id} className="profile-character-card profile-character-card-framed">
                  <div
                    className="profile-character-avatar"
                    style={{ ["--profile-character-frame-image" as string]: `url(${profileBorderCharacter})` }}
                  >
                    {getProfileCharacterImage(character) ? (
                      <img src={getProfileCharacterImage(character)!} alt={`${character.name} avatar`} />
                    ) : (
                      <span className="profile-character-avatar-fallback">{character.name.slice(0, 1)}</span>
                    )}
                    <span className="profile-character-nameplate">{character.name}</span>
                  </div>
                  <div className="profile-character-copy">
                    <span>
                      {character.ancestry} / {getClassLabel(character.className)}
                    </span>
                    <span>레벨 {character.level}</span>
                    <span>최근 플레이 {formatCompactDate(character.updatedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="profile-empty">아직 최근 사용 캐릭터가 없습니다.</p>
          )}
        </article>

        <article className="profile-card profile-framed-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Activity</span>
              <h2>활동 요약</h2>
            </div>
          </div>

          <div className="profile-stat-grid">
            {statRows.map((row) => (
              <div key={row.label} className="profile-stat-card">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>

          <div className="profile-session-list">
            <strong>최근 세션</strong>
            {loadingActivity ? (
              <p className="profile-muted-text">세션 목록을 불러오는 중입니다.</p>
            ) : recentSessionRows.length > 0 ? (
              <div className="profile-session-items">
                {recentSessionRows.map((session) => (
                  <div key={session.sessionId} className="profile-session-item">
                    <strong>{session.title}</strong>
                    <span>
                      {session.scenarioTitle} · {session.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="profile-muted-text">아직 참여한 세션이 없습니다.</p>
            )}
          </div>
        </article>
      </section>

      <section className="profile-grid profile-grid-compact">
        <article className="profile-card profile-framed-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Identity</span>
              <h2>기본 정보</h2>
            </div>
          </div>

          <dl className="profile-kv-grid">
            {/* 사용자에게 보이는 이름은 닉네임 하나로 통일하고, 변경 기능도 이 화면에서만 제공합니다. */}
            <div className="profile-kv-item">
              <dt>닉네임</dt>
              <dd>
                {editing ? (
                  <form className="profile-inline-edit" onSubmit={submitEdit}>
                    <input
                      type="text"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      minLength={2}
                      maxLength={10}
                      autoFocus
                      disabled={saving}
                      aria-label="닉네임 입력"
                    />
                    <button type="submit" className="primary" disabled={saving}>
                      {saving ? "저장 중" : "저장"}
                    </button>
                    <button type="button" className="ghost" onClick={cancelEditing} disabled={saving}>
                      취소
                    </button>
                  </form>
                ) : (
                  <div className="profile-inline-edit">
                    <span>{nickname}</span>
                    {canEditNickname ? (
                      <button type="button" className="ghost" onClick={startEditing}>
                        변경
                      </button>
                    ) : null}
                  </div>
                )}
                {editError ? <p className="panel-error">{editError}</p> : null}
              </dd>
            </div>
            {profileRows.map((row) => (
              <div key={row.label} className="profile-kv-item">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      {profileError || activityError || error ? <p className="panel-error">{profileError ?? activityError ?? error}</p> : null}
    </main>
  );
}

function formatCompactDate(value: string | null | undefined): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const profileAvatarPresetImageById = new Map<string, string>([
  ["preset_wizard", defaultWizardImage],
  ["preset_archer", defaultArcherImage],
  ["preset_rogue", defaultRogueImage],
  ["preset_warrior", defaultWarriorImage],
]);

const profilePresetIdByClassName = new Map<string, string>([
  ["Wizard", "preset_wizard"],
  ["Ranger", "preset_archer"],
  ["Rogue", "preset_rogue"],
  ["Fighter", "preset_warrior"],
  ["Archer", "preset_archer"],
  ["Warrior", "preset_warrior"],
]);

function getProfileCharacterImage(character: Pick<PersistentCharacter, "avatarUrl" | "avatarPresetId" | "className">) {
  if (character.avatarUrl) return character.avatarUrl;

  const presetId = character.avatarPresetId ?? profilePresetIdByClassName.get(character.className) ?? "preset_wizard";
  return profileAvatarPresetImageById.get(presetId) ?? defaultWizardImage;
}
