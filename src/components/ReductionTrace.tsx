import { useMemo, useState } from 'react'

import type { Circuit } from '../circuit/model'
import { computeReductionLevels } from '../circuit/reduce'
import { CircuitView } from './CircuitView'
import { LatexBlock } from './LatexBlock'

function equivalentOhms(circuit: Circuit): number | null {
  const nodes =
    circuit.route.mode === 'u'
      ? [...(circuit.top ?? []), ...(circuit.right ?? []), ...(circuit.bottom ?? [])]
      : [...(circuit.items ?? [])]
  if (nodes.length !== 1) return null
  const only = nodes[0]
  if (only.kind === 'resistor') return only.ohms
  if (only.kind === 'ammeter') return 0
  return null
}

type Props = {
  circuit: Circuit
}

export function ReductionTrace({ circuit }: Props) {
  const [expanded, setExpanded] = useState(true)
  const result = useMemo(() => computeReductionLevels(circuit), [circuit])

  const levels = result.levels
  const last = levels[levels.length - 1]
  const req = equivalentOhms(last.circuit)

  return (
    <div className="panel">
      <div className="panelHeader">
        <div>
          <div className="panelTitle">Reduction</div>
          <div className="panelSubtitle">
            Deepest-first • One depth level per step • {req !== null ? `R_eq = ${req}Ω` : 'R_eq: n/a'}
          </div>
        </div>
        <button className="btn" type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {'error' in result ? (
        <div className="row addRow" style={{ borderColor: 'rgba(255,100,120,0.5)' }}>
          <div className="cell kind" style={{ color: 'rgba(255,140,160,0.95)' }}>
            Blocked
          </div>
          <div className="cell mutedSmall">{result.error}</div>
        </div>
      ) : null}

      {expanded ? (
        <div className="trace">
          {levels.map((level) => (
            <div key={level.index} className="traceStep">
              <div className="mutedSmall" style={{ marginBottom: 6 }}>
                Level {level.index}
              </div>
              {level.index > 0 ? <LatexBlock latex={level.latexAligned} /> : null}
              <CircuitView circuit={level.circuit} />
            </div>
          ))}
        </div>
      ) : (
        <CircuitView circuit={levels[0].circuit} />
      )}
    </div>
  )
}
