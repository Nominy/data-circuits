import type { SeriesListKey } from '../circuit/model'
import { useCircuitStore } from '../store/circuitStore'
import { SeriesListEditor } from './SeriesListEditor'

export function CircuitEditor() {
  const circuit = useCircuitStore((s) => s.circuit)
  const reset = useCircuitStore((s) => s.reset)
  const setRootRouteMode = useCircuitStore((s) => s.setRootRouteMode)

  const route = circuit.route ?? { mode: 'straight' as const }

  return (
    <div className="panel">
      <div className="panelHeader">
        <div>
          <div className="panelTitle">Circuit</div>
          <div className="panelSubtitle">Series / Parallel only - DC - ideal ammeter</div>
        </div>
        <button className="btn" onClick={reset} type="button">
          Reset
        </button>
      </div>

      <div className="row addRow" style={{ marginBottom: 10 }}>
        <div className="cell kind mutedSmall">Layout</div>
        <div className="cell actions">
          <button
            className="btn tiny"
            type="button"
            onClick={() => setRootRouteMode('straight')}
            disabled={route.mode === 'straight'}
          >
            Straight
          </button>
          <button
            className="btn tiny"
            type="button"
            onClick={() => setRootRouteMode('u')}
            disabled={route.mode === 'u'}
          >
            U (2 bends)
          </button>
        </div>
      </div>

      {route.mode === 'u' ? (
        <div className="routeRoot">
          <SeriesListEditor
            listKey={'root:top' satisfies SeriesListKey}
            title="+ to - (Top →)"
          />
          <div className="routeSep">90° turn</div>
          <SeriesListEditor
            listKey={'root:right' satisfies SeriesListKey}
            title="Right (↓)"
          />
          <div className="routeSep">90° turn</div>
          <SeriesListEditor
            listKey={'root:bottom' satisfies SeriesListKey}
            title="Bottom (←)"
          />
        </div>
      ) : (
        <SeriesListEditor listKey={'root' satisfies SeriesListKey} title="+ to -" />
      )}
    </div>
  )
}
