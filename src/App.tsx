import './App.css'

import { useState } from 'react'

import { CircuitEditor } from './components/CircuitEditor'
import { CircuitView } from './components/CircuitView'
import { ExportPanel } from './components/ExportPanel'
import { Modal } from './components/Modal'
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

  const [showStrict, setShowStrict] = useState(false)
  const [showExport, setShowExport] = useState(false)

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="topBarLeft">
          <div className="brand">Data Circuits</div>
          <div className="topBarHint">Full-canvas editor • Drag nodes • Drag components to connect</div>
        </div>
        <div className="topBarRight">
          <button className="btn tiny" type="button" onClick={() => setShowStrict(true)}>
            Strict view
          </button>
          <button className="btn tiny" type="button" onClick={() => setShowExport(true)}>
            Export
          </button>
        </div>
      </header>

      <main className="workspace">
        <CircuitEditor />
      </main>

      {showStrict ? (
        <Modal title="Strict view" onClose={() => setShowStrict(false)}>
          <div className="modalContent">
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
            <div style={{ height: 12 }} />
            <ReductionTrace circuit={circuit} />
          </div>
        </Modal>
      ) : null}

      {showExport ? (
        <Modal title="Export" onClose={() => setShowExport(false)}>
          <div className="modalContent">
            <ExportPanel circuit={circuit} />
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

export default App

