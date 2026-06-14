import { Circle, Group, Text } from 'react-konva';

export type BattleMapPingMarker = {
  id: string;
  x: number;
  y: number;
  label: string;
  expiresAt?: string;
};

interface BattleMapPingMarkersProps {
  pings: BattleMapPingMarker[];
}

export function BattleMapPingMarkers({ pings }: BattleMapPingMarkersProps) {
  return (
    <>
      {pings.map((ping) => (
        <Group key={ping.id} x={ping.x} y={ping.y}>
          <Circle radius={28} fill="rgba(255, 214, 102, 0.22)" stroke="#ffd666" strokeWidth={3} />
          <Circle radius={9} fill="#ffd666" />
          <Text text={ping.label} x={-5} y={-11} fill="#061017" fontStyle="bold" fontSize={18} />
        </Group>
      ))}
    </>
  );
}
