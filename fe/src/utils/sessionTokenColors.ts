export type SessionTokenColor = {
  label: string;
  frame: string;
  background: string;
  text: string;
};

export const PLAYER_TOKEN_COLORS: SessionTokenColor[] = [
  { label: '파스텔 스카이', frame: '#6EC6FF', background: '#E7F6FF', text: '#0F3A52' },
  { label: '파스텔 피치', frame: '#FFB071', background: '#FFF0E6', text: '#6E3511' },
  { label: '파스텔 레몬', frame: '#F6D65B', background: '#FFF8D8', text: '#5E4B00' },
  { label: '파스텔 라벤더', frame: '#B69CFF', background: '#F2EDFF', text: '#402B78' },
  { label: '파스텔 민트', frame: '#6EDFB0', background: '#E9FFF5', text: '#14583A' },
  { label: '파스텔 로즈', frame: '#FF8FB1', background: '#FFEAF1', text: '#70304A' },
  { label: '파스텔 아쿠아', frame: '#5FD6D0', background: '#E5FBFA', text: '#0D5551' },
  { label: '파스텔 페리윙클', frame: '#8EA7FF', background: '#EEF2FF', text: '#263E8A' },
];

export const GM_TOKEN_COLOR: SessionTokenColor = {
  label: '골드',
  frame: '#C79943',
  background: '#FFF4D2',
  text: '#5C3B08',
};

export const NPC_TOKEN_COLOR: SessionTokenColor = {
  label: '딥 틸',
  frame: '#0F766E',
  background: '#DFF7F4',
  text: '#07423E',
};

export const MONSTER_TOKEN_COLOR: SessionTokenColor = {
  label: '크림슨 레드',
  frame: '#B42318',
  background: '#FFE5E0',
  text: '#75180F',
};

export function getPlayerTokenColor(index: number): SessionTokenColor {
  // 플레이어 슬롯은 1~8번까지 고정 팔레트로 구분하고, 초과/미확인 값은 순환시켜 화면이 깨지지 않게 합니다.
  const safeIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  return PLAYER_TOKEN_COLORS[safeIndex % PLAYER_TOKEN_COLORS.length];
}
