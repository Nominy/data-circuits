import type { Node, SeriesListKey } from '../circuit/model'
import { listKeyForBranch, listKeyForSeriesBlock } from '../circuit/model'
import { getSeriesListByKey } from '../circuit/selectors'
import { useCircuitStore } from '../store/circuitStore'

type Props = {
  listKey: SeriesListKey
  title?: string
  depth?: number
  itemsOverride?: Node[]
  indexOffset?: number
  hideAddRow?: boolean
  minIndex?: number
  maxIndex?: number
}

function kindLabel(kind: Node['kind']): string {
  switch (kind) {
    case 'resistor':
      return 'Resistor'
    case 'ammeter':
      return 'Ammeter'
    case 'vsource':
      return 'Voltage source'
    case 'isource':
      return 'Current source'
    case 'series':
      return 'Sub-circuit (Series)'
    case 'parallel':
      return 'Parallel'
  }
}

export function SeriesListEditor({
  listKey,
  title,
  depth = 0,
  itemsOverride,
  indexOffset = 0,
  hideAddRow = false,
  minIndex,
  maxIndex,
}: Props) {
  const circuit = useCircuitStore((s) => s.circuit)
  const insertNode = useCircuitStore((s) => s.insertNode)
  const removeNode = useCircuitStore((s) => s.removeNode)
  const moveNode = useCircuitStore((s) => s.moveNode)
  const updateNodeName = useCircuitStore((s) => s.updateNodeName)
  const updateResistorOhms = useCircuitStore((s) => s.updateResistorOhms)
  const updateVoltageSourceVolts = useCircuitStore((s) => s.updateVoltageSourceVolts)
  const updateCurrentSourceAmps = useCircuitStore((s) => s.updateCurrentSourceAmps)
  const addParallelBranch = useCircuitStore((s) => s.addParallelBranch)
  const removeParallelBranch = useCircuitStore((s) => s.removeParallelBranch)
  const updateBranchName = useCircuitStore((s) => s.updateBranchName)

  const items = itemsOverride ?? getSeriesListByKey(circuit, listKey)
  const effectiveMinIndex = minIndex ?? 0
  const effectiveMaxIndex = maxIndex ?? indexOffset + items.length - 1

  return (
    <div className="seriesList" style={{ marginLeft: depth === 0 ? 0 : 12 }}>
      {title ? <div className="seriesListTitle">{title}</div> : null}

      {items.length === 0 ? <div className="muted">Empty</div> : null}

      {items.map((node, idx) => {
        const absoluteIndex = indexOffset + idx
        return (
          <div key={node.id} className="row">
            <div className="cell kind">{kindLabel(node.kind)}</div>

            <div className="cell grow">
              <input
                className="input"
                placeholder="Label (optional)"
                value={node.name ?? ''}
                onChange={(e) => updateNodeName(node.id, e.target.value)}
              />
            </div>

            {node.kind === 'resistor' ? (
              <div className="cell">
                <input
                  className="input num"
                  type="number"
                  min={0.000001}
                  step={1}
                  value={node.ohms}
                  onChange={(e) => updateResistorOhms(node.id, Number(e.target.value))}
                />
                <span className="unit">Ω</span>
              </div>
            ) : node.kind === 'vsource' ? (
              <div className="cell">
                <input
                  className="input num"
                  type="number"
                  step={0.1}
                  value={node.volts}
                  onChange={(e) => updateVoltageSourceVolts(node.id, Number(e.target.value))}
                />
                <span className="unit">V</span>
              </div>
            ) : node.kind === 'isource' ? (
              <div className="cell">
                <input
                  className="input num"
                  type="number"
                  step={0.001}
                  value={node.amps}
                  onChange={(e) => updateCurrentSourceAmps(node.id, Number(e.target.value))}
                />
                <span className="unit">A</span>
              </div>
            ) : (
              <div className="cell mutedSmall">{node.kind === 'ammeter' ? '0 Ω' : ''}</div>
            )}

            <div className="cell actions">
              <button
                className="btn tiny"
                type="button"
                onClick={() => moveNode(listKey, absoluteIndex, absoluteIndex - 1)}
                disabled={absoluteIndex <= effectiveMinIndex}
              >
                Up
              </button>
              <button
                className="btn tiny"
                type="button"
                onClick={() => moveNode(listKey, absoluteIndex, absoluteIndex + 1)}
                disabled={absoluteIndex >= effectiveMaxIndex}
              >
                Down
              </button>
              <button className="btn tiny danger" type="button" onClick={() => removeNode(listKey, absoluteIndex)}>
                Delete
              </button>
            </div>

            <div className="cell insert">
              <div className="insertLabel">Insert after</div>
              <div className="insertBtns">
                <button className="btn tiny" type="button" onClick={() => insertNode(listKey, absoluteIndex + 1, 'resistor')}>
                  +R
                </button>
                <button className="btn tiny" type="button" onClick={() => insertNode(listKey, absoluteIndex + 1, 'ammeter')}>
                  +A
                </button>
                <button className="btn tiny" type="button" onClick={() => insertNode(listKey, absoluteIndex + 1, 'vsource')}>
                  +V
                </button>
                <button className="btn tiny" type="button" onClick={() => insertNode(listKey, absoluteIndex + 1, 'isource')}>
                  +I
                </button>
                <button className="btn tiny" type="button" onClick={() => insertNode(listKey, absoluteIndex + 1, 'series')}>
                  +S
                </button>
                <button className="btn tiny" type="button" onClick={() => insertNode(listKey, absoluteIndex + 1, 'parallel')}>
                  +P
                </button>
              </div>
            </div>

            {node.kind === 'series' ? (
              <div className="nested">
                <SeriesListEditor listKey={listKeyForSeriesBlock(node.id)} title="Series" depth={depth + 1} />
              </div>
            ) : null}

            {node.kind === 'parallel' ? (
              <div className="nested">
                <div className="parallelHeader">
                  <div className="seriesListTitle">Parallel branches</div>
                  <button className="btn tiny" type="button" onClick={() => addParallelBranch(node.id)}>
                    + Branch
                  </button>
                </div>

                {node.branches.map((b, branchIndex) => (
                  <div key={b.id} className="branch">
                    <div className="branchHeader">
                      <div className="mutedSmall">Branch {branchIndex + 1}</div>
                      <input
                        className="input"
                        placeholder="Branch label (optional)"
                        value={b.name ?? ''}
                        onChange={(e) => updateBranchName(node.id, b.id, e.target.value)}
                      />
                      <button
                        className="btn tiny danger"
                        type="button"
                        onClick={() => removeParallelBranch(node.id, b.id)}
                        disabled={node.branches.length <= 2}
                        title={node.branches.length <= 2 ? 'At least 2 branches required' : 'Remove branch'}
                      >
                        Remove
                      </button>
                    </div>
                    <SeriesListEditor listKey={listKeyForBranch(node.id, b.id)} depth={depth + 1} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}

      {hideAddRow ? null : (
        <div className="row addRow">
          <div className="cell kind mutedSmall">Add</div>
          <div className="cell grow" />
          <div className="cell actions">
            <button className="btn tiny" type="button" onClick={() => insertNode(listKey, indexOffset + items.length, 'resistor')}>
              + Resistor
            </button>
            <button className="btn tiny" type="button" onClick={() => insertNode(listKey, indexOffset + items.length, 'ammeter')}>
              + Ammeter
            </button>
            <button className="btn tiny" type="button" onClick={() => insertNode(listKey, indexOffset + items.length, 'vsource')}>
              + V Source
            </button>
            <button className="btn tiny" type="button" onClick={() => insertNode(listKey, indexOffset + items.length, 'isource')}>
              + I Source
            </button>
            <button className="btn tiny" type="button" onClick={() => insertNode(listKey, indexOffset + items.length, 'series')}>
              + Series
            </button>
            <button className="btn tiny" type="button" onClick={() => insertNode(listKey, indexOffset + items.length, 'parallel')}>
              + Parallel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
