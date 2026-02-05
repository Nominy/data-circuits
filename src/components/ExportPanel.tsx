import { useMemo, useState } from 'react'

import type { Circuit } from '../circuit/model'
import { exportCircuitikz } from '../circuit/circuitikz'
import { exportCircuitJson, parseCircuitJson } from '../circuit/jsonIo'
import { computeReductionLevels } from '../circuit/reduce'
import { exportSolutionLatex } from '../circuit/solutionExport'
import { circuitHasIndependentSources } from '../circuit/graph'
import { useCircuitStore } from '../store/circuitStore'

type Mode = 'circuitikz' | 'solution-latex' | 'json'

type Props = {
  circuit: Circuit
}

export function ExportPanel({ circuit }: Props) {
  const settings = useCircuitStore((s) => s.settings)
  const setCircuit = useCircuitStore((s) => s.setCircuit)
  const nodeCircuit = useCircuitStore((s) => s.nodeCircuit)
  const supplyVoltsText = useCircuitStore((s) => s.analysis.supplyVoltsText)
  const setSupplyVoltsText = useCircuitStore((s) => s.setSupplyVoltsText)
  const [mode, setMode] = useState<Mode>('solution-latex')
  const [includeLabels, setIncludeLabels] = useState(true)
  const [includeValues, setIncludeValues] = useState(true)
  const [includeGeneratedLabels, setIncludeGeneratedLabels] = useState(true)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const reduction = useMemo(() => computeReductionLevels(circuit), [circuit])
  const hasSources = useMemo(() => circuitHasIndependentSources(circuit), [circuit])

  const text = useMemo(() => {
    const opts = { includeLabels, includeValues, includeGeneratedLabels }
    if (mode === 'circuitikz') {
      const includeTerminals = supplyVoltsText.trim().length > 0 ? true : !hasSources
      return exportCircuitikz(circuit, { ...opts, includeTerminals })
    }
    if (mode === 'json') return exportCircuitJson(circuit)

    const raw = supplyVoltsText.trim()
    const supplyVolts = raw.length === 0 ? undefined : Number(raw)
    const analysis = raw.length === 0 || !Number.isFinite(supplyVolts) ? undefined : { supplyVolts }
    return exportSolutionLatex(reduction.levels, opts, analysis, nodeCircuit)
  }, [mode, circuit, includeLabels, includeValues, includeGeneratedLabels, reduction.levels, supplyVoltsText, hasSources, nodeCircuit])

  const copy = async () => {
    await navigator.clipboard.writeText(text)
  }

  const doImport = () => {
    const result = parseCircuitJson(importText)
    if (!result.ok) {
      setImportError(result.error)
      return
    }
    setImportError(null)
    setCircuit(result.circuit)
  }

  const importFromFile = async (file: File) => {
    const content = await file.text()
    setImportText(content)
    const result = parseCircuitJson(content)
    if (!result.ok) {
      setImportError(result.error)
      return
    }
    setImportError(null)
    setCircuit(result.circuit)
  }

  return (
    <div className="panel">
      <div className="panelHeader">
        <div>
          <div className="panelTitle">Export</div>
          <div className="panelSubtitle">CircuitikZ + LaTeX formulas + JSON</div>
        </div>
        <button className="btn" type="button" onClick={copy}>
          Copy
        </button>
      </div>

      <div className="row addRow" style={{ marginBottom: 10 }}>
        <div className="cell kind mutedSmall">Mode</div>
        <div className="cell actions">
          <button className="btn tiny" type="button" onClick={() => setMode('circuitikz')} disabled={mode === 'circuitikz'}>
            CircuitikZ
          </button>
          <button
            className="btn tiny"
            type="button"
            onClick={() => setMode('solution-latex')}
            disabled={mode === 'solution-latex'}
          >
            Full solution (LaTeX)
          </button>
          <button className="btn tiny" type="button" onClick={() => setMode('json')} disabled={mode === 'json'}>
            Circuit JSON
          </button>
        </div>
      </div>

      {mode !== 'json' ? (
        <div className="row addRow" style={{ marginBottom: 10 }}>
          <div className="cell kind mutedSmall">Options</div>
          <div className="cell actions" style={{ flexWrap: 'wrap' }}>
            <button className="btn tiny" type="button" onClick={() => setIncludeLabels((v) => !v)}>
              {includeLabels ? 'Labels: on' : 'Labels: off'}
            </button>
            <button className="btn tiny" type="button" onClick={() => setIncludeValues((v) => !v)}>
              {includeValues ? 'Values: on' : 'Values: off'}
            </button>
            <button className="btn tiny" type="button" onClick={() => setIncludeGeneratedLabels((v) => !v)}>
              {includeGeneratedLabels ? 'Req labels: on' : 'Req labels: off'}
            </button>
            <div className="mutedSmall" style={{ marginLeft: 6 }}>
              (Preview: values {settings.showValuesOnDiagram ? 'on' : 'off'})
            </div>
          </div>
        </div>
      ) : null}

      {mode === 'solution-latex' ? (
        <div className="row addRow" style={{ marginBottom: 10 }}>
          <div className="cell kind mutedSmall">Supply</div>
          <div className="cell actions" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input num"
              type="number"
              step={0.1}
              min={0}
              placeholder="U (V)"
              value={supplyVoltsText}
              onChange={(e) => setSupplyVoltsText(e.target.value)}
              style={{ width: 120 }}
            />
            <div className="mutedSmall" style={{ marginLeft: 6 }}>
              External supply $U_s$ in volts (optional: added as a voltage source between + and - terminals).
            </div>
          </div>
        </div>
      ) : null}

      {'error' in reduction ? (
        <div className="mutedSmall" style={{ marginBottom: 10, color: 'rgba(255,140,160,0.95)' }}>
          Reduction blocked: {reduction.error}
        </div>
      ) : null}

      <textarea className="exportBox" value={text} readOnly rows={16} />

      <div className="row addRow" style={{ marginTop: 12, marginBottom: 10 }}>
        <div className="cell kind mutedSmall">Import</div>
        <div className="cell actions" style={{ justifyContent: 'space-between', width: '100%' }}>
          <input
            className="fileInput"
            type="file"
            accept=".json,application/json,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFromFile(f)
              e.target.value = ''
            }}
          />
          <button className="btn tiny" type="button" onClick={doImport}>
            Load JSON
          </button>
        </div>
      </div>
      {importError ? (
        <div className="mutedSmall" style={{ marginBottom: 10, color: 'rgba(255,140,160,0.95)' }}>
          Import error: {importError}
        </div>
      ) : null}
      <textarea
        className="exportBox"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        placeholder="Paste circuit JSON here, then click “Load JSON”"
        rows={10}
      />
    </div>
  )
}
