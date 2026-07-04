import { Injectable } from "@nestjs/common";

type ScenarioStartNodeSource = {
  id: string;
  transitionsJson: string;
};

@Injectable()
export class SessionStartNodeService {
  resolveStartNodeId(
    nodes: ScenarioStartNodeSource[],
    requestedStartNodeId: string | null | undefined,
  ): string | null {
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (!nodeIds.size) {
      return null;
    }

    const incoming = new Map<string, number>();
    nodes.forEach((node) => {
      const transitions = this.parseJson<Record<string, unknown>[]>(node.transitionsJson, []);
      transitions.forEach((transition) => {
        const nextNodeId = transition.nextNodeId;
        if (typeof nextNodeId === "string" && nodeIds.has(nextNodeId)) {
          incoming.set(nextNodeId, (incoming.get(nextNodeId) ?? 0) + 1);
        }
      });
    });

    const rootNodes = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
    if (
      requestedStartNodeId &&
      nodeIds.has(requestedStartNodeId) &&
      (rootNodes.length !== 1 || rootNodes[0].id === requestedStartNodeId)
    ) {
      return requestedStartNodeId;
    }

    return rootNodes.length === 1
      ? rootNodes[0].id
      : requestedStartNodeId && nodeIds.has(requestedStartNodeId)
        ? requestedStartNodeId
        : nodes[0].id;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
