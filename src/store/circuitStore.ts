import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import {
  createAmmeter,
  createCircuit,
  createCurrentSource,
  createParallelBlock,
  createParallelBranch,
  createResistor,
  createSeriesBlock,
  createVoltageSource,
} from '../circuit/factory'
import { nodeCircuitToSeriesParallelCircuit } from '../circuit/nodeCircuitConvert'
import { createNodeCircuit } from '../circuit/nodeCircuitFactory'
import { seriesParallelCircuitToNodeCircuit } from '../circuit/nodeCircuitFromCircuit'
import type { Circuit, Node, ParallelBlock, SeriesBlock, SeriesListKey } from '../circuit/model'
import type { NodeCircuit, NodeCircuitEdge } from '../circuit/nodeCircuit'
import { newId } from '../circuit/id'

type UiSettings = {
  showValuesOnDiagram: boolean
  showGeneratedLabels: boolean
}

type CircuitState = {
  circuit: Circuit
  nodeCircuit: NodeCircuit
  nodeCircuitError: string | null
  settings: UiSettings
  analysis: { supplyVoltsText: string }
  setRootRouteMode: (mode: 'straight' | 'u') => void
  setCircuit: (circuit: Circuit) => void
  setNodeCircuit: (nodeCircuit: NodeCircuit) => void
  setSupplyVoltsText: (text: string) => void
  resetNodeCircuit: () => void
  addNodeCircuitNode: (at: { x: number; y: number }) => string | null
  removeNodeCircuitNode: (nodeId: string) => void
  setNodeCircuitNodePos: (nodeId: string, pos: { x: number; y: number }) => void
  setNodeCircuitPlusNode: (nodeId: string) => void
  setNodeCircuitMinusNode: (nodeId: string) => void
  addNodeCircuitEdge: (kind: NodeCircuitEdge['kind'], a: string, b: string) => void
  updateNodeCircuitEdgeEndpoints: (edgeId: string, a: string, b: string) => void
  flipNodeCircuitEdge: (edgeId: string) => void
  updateNodeCircuitNodeName: (nodeId: string, name: string) => void
  updateNodeCircuitEdgeName: (edgeId: string, name: string) => void
  updateNodeCircuitResistorOhms: (edgeId: string, ohms: number) => void
  updateNodeCircuitVoltageSourceVolts: (edgeId: string, volts: number) => void
  updateNodeCircuitCurrentSourceAmps: (edgeId: string, amps: number) => void
  addParallelOnEdge: (edgeId: string, kind: NodeCircuitEdge['kind']) => void
  addSeriesOnEdge: (edgeId: string, kind: NodeCircuitEdge['kind']) => void
  removeNodeCircuitEdge: (edgeId: string) => void
  swapNodeCircuitTerminals: () => void
  insertNode: (listKey: SeriesListKey, index: number, kind: Node['kind']) => void
  removeNode: (listKey: SeriesListKey, index: number) => void
  moveNode: (listKey: SeriesListKey, fromIndex: number, toIndex: number) => void
  updateNodeName: (nodeId: string, name: string) => void
  updateResistorOhms: (nodeId: string, ohms: number) => void
  updateVoltageSourceVolts: (nodeId: string, volts: number) => void
  updateCurrentSourceAmps: (nodeId: string, amps: number) => void
  addParallelBranch: (parallelId: string) => void
  removeParallelBranch: (parallelId: string, branchId: string) => void
  updateBranchName: (parallelId: string, branchId: string, name: string) => void
  reset: () => void
  toggleShowValues: () => void
  toggleShowGeneratedLabels: () => void
}

function allRootNodes(circuit: Circuit): Node[] {
  return circuit.route.mode === 'u'
    ? [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
    : [...(circuit.items ?? [])]
}

function findSeriesBlock(node: Node, id: string): SeriesBlock | null {
  if (node.kind === 'series' && node.id === id) return node
  if (node.kind === 'series') {
    for (const child of node.items) {
      const found = findSeriesBlock(child, id)
      if (found) return found
    }
  }
  if (node.kind === 'parallel') {
    for (const branch of node.branches) {
      for (const child of branch.items) {
        const found = findSeriesBlock(child, id)
        if (found) return found
      }
    }
  }
  return null
}

function findParallelBlock(node: Node, id: string): ParallelBlock | null {
  if (node.kind === 'parallel' && node.id === id) return node
  if (node.kind === 'series') {
    for (const child of node.items) {
      const found = findParallelBlock(child, id)
      if (found) return found
    }
  }
  if (node.kind === 'parallel') {
    for (const branch of node.branches) {
      for (const child of branch.items) {
        const found = findParallelBlock(child, id)
        if (found) return found
      }
    }
  }
  return null
}

function getListByKey(circuit: Circuit, listKey: SeriesListKey): Node[] | null {
  if (listKey === 'root') return circuit.route.mode === 'straight' ? (circuit.items ?? []) : null
  if (listKey === 'root:top') return circuit.route.mode === 'u' ? (circuit.top ?? []) : null
  if (listKey === 'root:right') return circuit.route.mode === 'u' ? (circuit.right ?? []) : null
  if (listKey === 'root:bottom') return circuit.route.mode === 'u' ? (circuit.bottom ?? []) : null
  if (listKey.startsWith('series:')) {
    const seriesId = listKey.slice('series:'.length)
    for (const node of allRootNodes(circuit)) {
      const found = findSeriesBlock(node, seriesId)
      if (found) return found.items
    }
    return null
  }
  if (listKey.startsWith('branch:')) {
    const [, parallelId, branchId] = listKey.split(':')
    for (const node of allRootNodes(circuit)) {
      const parallel = findParallelBlock(node, parallelId)
      if (!parallel) continue
      const branch = parallel.branches.find((b) => b.id === branchId)
      return branch ? branch.items : null
    }
    return null
  }
  return null
}

function visitNodes(items: Node[], fn: (node: Node) => void) {
  for (const node of items) {
    fn(node)
    if (node.kind === 'series') visitNodes(node.items, fn)
    if (node.kind === 'parallel') {
      for (const branch of node.branches) visitNodes(branch.items, fn)
    }
  }
}

function deriveTreeCircuitFromNodeCircuit(nodeCircuit: NodeCircuit): { ok: true; circuit: Circuit } | { ok: false; error: string } {
  const converted = nodeCircuitToSeriesParallelCircuit(nodeCircuit)
  if (!converted.ok) return { ok: false, error: converted.error }
  return { ok: true, circuit: converted.circuit }
}

export const useCircuitStore = create<CircuitState>()(
  immer((set) => ({
    ...(() => {
      const nodeCircuit = createNodeCircuit()
      const derived = deriveTreeCircuitFromNodeCircuit(nodeCircuit)
      return { nodeCircuit, nodeCircuitError: derived.ok ? null : derived.error, circuit: derived.ok ? derived.circuit : createCircuit() }
    })(),
    settings: { showValuesOnDiagram: true, showGeneratedLabels: true },
    analysis: { supplyVoltsText: '' },
    setCircuit: (circuit) =>
      set(() => {
        const converted = seriesParallelCircuitToNodeCircuit(circuit)
        if (converted.ok) {
          const derived = deriveTreeCircuitFromNodeCircuit(converted.nodeCircuit)
          return {
            nodeCircuit: converted.nodeCircuit,
            nodeCircuitError: derived.ok ? null : derived.error,
            ...(derived.ok ? { circuit: derived.circuit } : {}),
          }
        }
        return { circuit }
      }),
    setNodeCircuit: (nodeCircuit) =>
      set(() => {
        const derived = deriveTreeCircuitFromNodeCircuit(nodeCircuit)
        return { nodeCircuit, nodeCircuitError: derived.ok ? null : derived.error, ...(derived.ok ? { circuit: derived.circuit } : {}) }
      }),
    setSupplyVoltsText: (text) =>
      set((draft) => {
        draft.analysis.supplyVoltsText = text
      }),
    resetNodeCircuit: () =>
      set(() => {
        const nodeCircuit = createNodeCircuit()
        const derived = deriveTreeCircuitFromNodeCircuit(nodeCircuit)
        return { nodeCircuit, nodeCircuitError: derived.ok ? null : derived.error, circuit: derived.ok ? derived.circuit : createCircuit() }
      }),
    addNodeCircuitNode: (at) => {
      if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return null
      const nodeId = newId('n')
      set((draft) => {
        draft.nodeCircuit.nodes.push({ id: nodeId, x: at.x, y: at.y })
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      })
      return nodeId
    },
    removeNodeCircuitNode: (nodeId) =>
      set((draft) => {
        const exists = draft.nodeCircuit.nodes.some((n) => n.id === nodeId)
        if (!exists) return
        draft.nodeCircuit.edges = draft.nodeCircuit.edges.filter((e) => e.a !== nodeId && e.b !== nodeId)
        draft.nodeCircuit.nodes = draft.nodeCircuit.nodes.filter((n) => n.id !== nodeId)
        if (draft.nodeCircuit.plusNodeId === nodeId) draft.nodeCircuit.plusNodeId = null
        if (draft.nodeCircuit.minusNodeId === nodeId) draft.nodeCircuit.minusNodeId = null
        if (draft.nodeCircuit.plusNodeId && draft.nodeCircuit.plusNodeId === draft.nodeCircuit.minusNodeId) {
          draft.nodeCircuit.minusNodeId = null
        }
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    setNodeCircuitNodePos: (nodeId, pos) =>
      set((draft) => {
        const node = draft.nodeCircuit.nodes.find((n) => n.id === nodeId)
        if (!node) return
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return
        node.x = pos.x
        node.y = pos.y
      }),
    setNodeCircuitPlusNode: (nodeId) =>
      set((draft) => {
        if (!draft.nodeCircuit.nodes.some((n) => n.id === nodeId)) return
        if (nodeId === draft.nodeCircuit.minusNodeId) return
        draft.nodeCircuit.plusNodeId = nodeId
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    setNodeCircuitMinusNode: (nodeId) =>
      set((draft) => {
        if (!draft.nodeCircuit.nodes.some((n) => n.id === nodeId)) return
        if (nodeId === draft.nodeCircuit.plusNodeId) return
        draft.nodeCircuit.minusNodeId = nodeId
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    addNodeCircuitEdge: (kind, a, b) =>
      set((draft) => {
        if (a === b) return
        if (!draft.nodeCircuit.nodes.some((n) => n.id === a)) return
        if (!draft.nodeCircuit.nodes.some((n) => n.id === b)) return
        const edge: NodeCircuitEdge =
          kind === 'wire'
            ? { kind: 'wire', id: newId('eW'), a, b }
            : kind === 'resistor'
            ? { kind: 'resistor', id: newId('eR'), ohms: 100, a, b }
            : kind === 'ammeter'
              ? { kind: 'ammeter', id: newId('eA'), a, b }
              : kind === 'vsource'
                ? { kind: 'vsource', id: newId('eV'), volts: 5, a, b }
                : { kind: 'isource', id: newId('eI'), amps: 0.01, a, b }
        draft.nodeCircuit.edges.push(edge)
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    updateNodeCircuitEdgeEndpoints: (edgeId, a, b) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge) return
        if (a === b) return
        if (!draft.nodeCircuit.nodes.some((n) => n.id === a)) return
        if (!draft.nodeCircuit.nodes.some((n) => n.id === b)) return
        edge.a = a
        edge.b = b
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    flipNodeCircuitEdge: (edgeId) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge) return
        const tmp = edge.a
        edge.a = edge.b
        edge.b = tmp
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    updateNodeCircuitNodeName: (nodeId, name) =>
      set((draft) => {
        const node = draft.nodeCircuit.nodes.find((n) => n.id === nodeId)
        if (!node) return
        if (name.trim().length === 0) delete node.name
        else node.name = name
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    updateNodeCircuitEdgeName: (edgeId, name) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge) return
        if (name.trim().length === 0) delete edge.name
        else edge.name = name
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    updateNodeCircuitResistorOhms: (edgeId, ohms) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge || edge.kind !== 'resistor') return
        if (!Number.isFinite(ohms) || ohms <= 0) return
        edge.ohms = ohms
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    updateNodeCircuitVoltageSourceVolts: (edgeId, volts) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge || edge.kind !== 'vsource') return
        if (!Number.isFinite(volts)) return
        edge.volts = volts
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    updateNodeCircuitCurrentSourceAmps: (edgeId, amps) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge || edge.kind !== 'isource') return
        if (!Number.isFinite(amps)) return
        edge.amps = amps
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    addParallelOnEdge: (edgeId, kind) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge) return
        const newEdge: NodeCircuitEdge =
          kind === 'resistor'
            ? { kind: 'resistor', id: newId('eR'), ohms: 100, a: edge.a, b: edge.b }
            : { kind: 'ammeter', id: newId('eA'), a: edge.a, b: edge.b }
        draft.nodeCircuit.edges.push(newEdge)
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    addSeriesOnEdge: (edgeId, kind) =>
      set((draft) => {
        const edge = draft.nodeCircuit.edges.find((e) => e.id === edgeId)
        if (!edge) return
        const mid = newId('n')
        draft.nodeCircuit.nodes.push({ id: mid, x: 240, y: 220 })
        const oldB = edge.b
        edge.b = mid
        const newEdge: NodeCircuitEdge =
          kind === 'resistor'
            ? { kind: 'resistor', id: newId('eR'), ohms: 100, a: mid, b: oldB }
            : { kind: 'ammeter', id: newId('eA'), a: mid, b: oldB }
        draft.nodeCircuit.edges.push(newEdge)
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    removeNodeCircuitEdge: (edgeId) =>
      set((draft) => {
        draft.nodeCircuit.edges = draft.nodeCircuit.edges.filter((e) => e.id !== edgeId)
        // prune isolated nodes (but keep terminals if set)
        const degree = new Map<string, number>()
        for (const n of draft.nodeCircuit.nodes) degree.set(n.id, 0)
        for (const e of draft.nodeCircuit.edges) {
          degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
          degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
        }
        draft.nodeCircuit.nodes = draft.nodeCircuit.nodes.filter((n) => {
          if (draft.nodeCircuit.plusNodeId && n.id === draft.nodeCircuit.plusNodeId) return true
          if (draft.nodeCircuit.minusNodeId && n.id === draft.nodeCircuit.minusNodeId) return true
          return (degree.get(n.id) ?? 0) > 0
        })
        if (draft.nodeCircuit.plusNodeId && !draft.nodeCircuit.nodes.some((n) => n.id === draft.nodeCircuit.plusNodeId)) {
          draft.nodeCircuit.plusNodeId = null
        }
        if (draft.nodeCircuit.minusNodeId && !draft.nodeCircuit.nodes.some((n) => n.id === draft.nodeCircuit.minusNodeId)) {
          draft.nodeCircuit.minusNodeId = null
        }
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    swapNodeCircuitTerminals: () =>
      set((draft) => {
        const tmp = draft.nodeCircuit.plusNodeId
        draft.nodeCircuit.plusNodeId = draft.nodeCircuit.minusNodeId
        draft.nodeCircuit.minusNodeId = tmp
        const derived = deriveTreeCircuitFromNodeCircuit(draft.nodeCircuit)
        if (derived.ok) draft.circuit = derived.circuit
        draft.nodeCircuitError = derived.ok ? null : derived.error
      }),
    setRootRouteMode: (mode) => {
      set((draft) => {
        if (mode === 'straight') {
          if (draft.circuit.route.mode === 'straight') return
          const items = [...(draft.circuit.top ?? []), ...(draft.circuit.right ?? []), ...(draft.circuit.bottom ?? [])]
          draft.circuit = { kind: 'circuit', id: draft.circuit.id, route: { mode: 'straight' }, items }
          return
        }
        if (draft.circuit.route.mode === 'u') return
        const items = [...(draft.circuit.items ?? [])]
        draft.circuit = {
          kind: 'circuit',
          id: draft.circuit.id,
          route: { mode: 'u' },
          top: [],
          right: [],
          bottom: items,
        }
      })
    },
    insertNode: (listKey, index, kind) => {
      set((draft) => {
        const list = getListByKey(draft.circuit, listKey)
        if (!list) return
        const node: Node =
          kind === 'resistor'
            ? createResistor()
            : kind === 'ammeter'
              ? createAmmeter()
              : kind === 'vsource'
                ? createVoltageSource()
                : kind === 'isource'
                  ? createCurrentSource()
              : kind === 'series'
                ? createSeriesBlock()
                : createParallelBlock()
        list.splice(index, 0, node)
      })
    },
    removeNode: (listKey, index) => {
      set((draft) => {
        const list = getListByKey(draft.circuit, listKey)
        if (!list) return
        list.splice(index, 1)
      })
    },
    moveNode: (listKey, fromIndex, toIndex) => {
      set((draft) => {
        const list = getListByKey(draft.circuit, listKey)
        if (!list) return
        if (fromIndex < 0 || fromIndex >= list.length) return
        if (toIndex < 0 || toIndex >= list.length) return
        const [item] = list.splice(fromIndex, 1)
        list.splice(toIndex, 0, item)
      })
    },
    updateNodeName: (nodeId, name) => {
      set((draft) => {
        visitNodes(allRootNodes(draft.circuit), (node) => {
          if (node.id !== nodeId) return
          if (name.trim().length === 0) delete node.name
          else node.name = name
        })
      })
    },
    updateResistorOhms: (nodeId, ohms) => {
      set((draft) => {
        visitNodes(allRootNodes(draft.circuit), (node) => {
          if (node.kind !== 'resistor') return
          if (node.id !== nodeId) return
          if (!Number.isFinite(ohms) || ohms <= 0) return
          node.ohms = ohms
        })
      })
    },
    updateVoltageSourceVolts: (nodeId, volts) => {
      set((draft) => {
        visitNodes(allRootNodes(draft.circuit), (node) => {
          if (node.kind !== 'vsource') return
          if (node.id !== nodeId) return
          if (!Number.isFinite(volts)) return
          node.volts = volts
        })
      })
    },
    updateCurrentSourceAmps: (nodeId, amps) => {
      set((draft) => {
        visitNodes(allRootNodes(draft.circuit), (node) => {
          if (node.kind !== 'isource') return
          if (node.id !== nodeId) return
          if (!Number.isFinite(amps)) return
          node.amps = amps
        })
      })
    },
    addParallelBranch: (parallelId) => {
      set((draft) => {
        for (const node of allRootNodes(draft.circuit)) {
          const parallel = findParallelBlock(node, parallelId)
          if (!parallel) continue
          parallel.branches.push(createParallelBranch())
          return
        }
      })
    },
    removeParallelBranch: (parallelId, branchId) => {
      set((draft) => {
        for (const node of allRootNodes(draft.circuit)) {
          const parallel = findParallelBlock(node, parallelId)
          if (!parallel) continue
          if (parallel.branches.length <= 2) return
          parallel.branches = parallel.branches.filter((b) => b.id !== branchId)
          return
        }
      })
    },
    updateBranchName: (parallelId, branchId, name) => {
      set((draft) => {
        for (const node of allRootNodes(draft.circuit)) {
          const parallel = findParallelBlock(node, parallelId)
          if (!parallel) continue
          const branch = parallel.branches.find((b) => b.id === branchId)
          if (!branch) return
          if (name.trim().length === 0) delete branch.name
          else branch.name = name
          return
        }
      })
    },
    reset: () => set({ circuit: createCircuit() }),
    toggleShowValues: () =>
      set((draft) => {
        draft.settings.showValuesOnDiagram = !draft.settings.showValuesOnDiagram
      }),
    toggleShowGeneratedLabels: () =>
      set((draft) => {
        draft.settings.showGeneratedLabels = !draft.settings.showGeneratedLabels
      }),
  })),
)
