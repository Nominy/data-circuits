import { newId } from './id'
import type { NodeCircuit, NodeCircuitEdge, NodeCircuitNode } from './nodeCircuit'

export function createNodeCircuit(): NodeCircuit {
  const nodes: NodeCircuitNode[] = []
  const edges: NodeCircuitEdge[] = []
  return { kind: 'node_circuit', id: newId('nc'), plusNodeId: null, minusNodeId: null, nodes, edges }
}
