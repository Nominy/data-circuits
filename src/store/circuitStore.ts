import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import {
  createAmmeter,
  createCircuit,
  createParallelBlock,
  createParallelBranch,
  createResistor,
  createSeriesBlock,
} from '../circuit/factory'
import type { Circuit, Node, ParallelBlock, SeriesBlock, SeriesListKey } from '../circuit/model'

type UiSettings = {
  showValuesOnDiagram: boolean
  showGeneratedLabels: boolean
}

type CircuitState = {
  circuit: Circuit
  settings: UiSettings
  setRootRouteMode: (mode: 'straight' | 'u') => void
  setCircuit: (circuit: Circuit) => void
  insertNode: (listKey: SeriesListKey, index: number, kind: Node['kind']) => void
  removeNode: (listKey: SeriesListKey, index: number) => void
  moveNode: (listKey: SeriesListKey, fromIndex: number, toIndex: number) => void
  updateNodeName: (nodeId: string, name: string) => void
  updateResistorOhms: (nodeId: string, ohms: number) => void
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

export const useCircuitStore = create<CircuitState>()(
  immer((set) => ({
    circuit: createCircuit(),
    settings: { showValuesOnDiagram: true, showGeneratedLabels: true },
    setCircuit: (circuit) => set({ circuit }),
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
