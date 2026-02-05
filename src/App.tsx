import './App.css'
import { CircuitEditor } from './components/CircuitEditor'
import { CircuitView } from './components/CircuitView'
import { ExportPanel } from './components/ExportPanel'
import { ReductionTrace } from './components/ReductionTrace'
import { useCircuitStore } from './store/circuitStore'

function App() {
  const circuit = useCircuitStore((s) => s.circuit)
  const settings = useCircuitStore((s) => s.settings)
  const supplyVoltsText = useCircuitStore((s) => s.analysis.supplyVoltsText)
  const toggleShowValues = useCircuitStore((s) => s.toggleShowValues)
  const toggleShowGeneratedLabels = useCircuitStore((s) => s.toggleShowGeneratedLabels)

  const rawSupply = supplyVoltsText.trim()
  const parsedSupply = rawSupply.length === 0 ? undefined : Number(rawSupply)
  const analysisSupplyVolts = rawSupply.length === 0 || !Number.isFinite(parsedSupply) ? undefined : parsedSupply

  return (
    <div className="app">
      <header className="appHeader">
        <div className="brand">Data Circuits</div>
        <div className="mutedSmall">Series/parallel visualizer • reducer • CircuitikZ exporter</div>
      </header>

      <div className="grid">
        <div className="col">
          <CircuitEditor />
        </div>
        <div className="col">
          <div className="panel">
            <div className="panelHeader">
              <div>
                <div className="panelTitle">Solution</div>
                <div className="panelSubtitle">Diagram + reduction</div>
              </div>
            </div>
            <div className="row addRow" style={{ marginBottom: 10 }}>
              <div className="cell kind mutedSmall">View</div>
              <div className="cell actions">
                <button className="btn tiny" type="button" onClick={toggleShowValues}>
                  {settings.showValuesOnDiagram ? 'Hide values' : 'Show values'}
                </button>
                <button className="btn tiny" type="button" onClick={toggleShowGeneratedLabels}>
                  {settings.showGeneratedLabels ? 'Hide Req labels' : 'Show Req labels'}
                </button>
              </div>
            </div>
            <CircuitView circuit={circuit} analysisSupplyVolts={analysisSupplyVolts} />
          </div>

          <ReductionTrace circuit={circuit} />
          <ExportPanel circuit={circuit} />
        </div>
      </div>
    </div>
  )
}

export default App
