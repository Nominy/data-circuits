import type { ReductionLevel } from './reduce'
import { exportCircuitikz, type CircuitikzOptions } from './circuitikz'
import { solveCircuitCurrentsAndVoltages } from './solve'

type AnalysisOptions = {
  supplyVolts?: number
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const rounded =
    Math.abs(value) >= 1000
      ? value.toPrecision(6)
      : Math.abs(value) >= 1
        ? value.toFixed(6)
        : value.toPrecision(6)
  return rounded.replace(/\.?0+$/, '')
}

export function exportSolutionLatex(
  levels: ReductionLevel[],
  options?: CircuitikzOptions,
  analysis?: AnalysisOptions,
): string {
  const supplyVolts = analysis?.supplyVolts
  const shouldSolve = typeof supplyVolts === 'number' && Number.isFinite(supplyVolts)
  const rootCircuit = levels[0]?.circuit
  const solved = shouldSolve && rootCircuit ? solveCircuitCurrentsAndVoltages(rootCircuit, supplyVolts) : null
  const currentArrowLabelsByResistorId: Record<string, string> = {}
  const resistorAutoLabelsById: Record<string, string> = {}
  if (solved?.ok) {
    for (const r of solved.result.resistors) {
      currentArrowLabelsByResistorId[r.id] = `I_{${r.index}}`
      resistorAutoLabelsById[r.id] = `R${r.index}`
    }
  }

  const lines: string[] = []
  lines.push('\\documentclass{article}')
  lines.push('\\usepackage{amsmath}')
  lines.push('\\usepackage{graphicx}')
  lines.push('\\usepackage{adjustbox}')
  lines.push('\\usepackage[margin=1in]{geometry}')
  lines.push('\\usepackage{circuitikz}')
  lines.push('\\begin{document}')
  lines.push('\\section*{Circuit reduction}')
  lines.push('\\ctikzset{european}')

  for (const level of levels) {
    lines.push(`\\subsection*{Level ${level.index}}`)
    const circuitikz = exportCircuitikz(level.circuit, {
      ...(options ?? {}),
      includeCtikzset: false,
      ...(level.index === 0 && Object.keys(currentArrowLabelsByResistorId).length > 0
        ? { currentArrowLabelsByResistorId, resistorAutoLabelsById }
        : {}),
    })
    lines.push('\\begin{center}')
    lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.55\\textheight},center}')
    lines.push(circuitikz)
    lines.push('\\end{adjustbox}')
    lines.push('\\end{center}')
    if (level.index > 0 && level.latexAligned.trim().length > 0) {
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.25\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push(level.latexAligned)
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
    }
    lines.push('')
  }

  if (shouldSolve) {
    lines.push('\\section*{Currents and voltages}')
    if (!solved) {
      lines.push('{\\small Could not compute currents/voltages.}')
    } else if (!solved.ok) {
      lines.push(`{\\small \\textbf{Cannot compute currents/voltages:} ${solved.error}}`)
    } else if (solved.result.resistors.length === 0) {
      lines.push('{\\small No resistors found to compute $I_k$ and $U_k$.}')
    } else {
      lines.push(`{\\small Given supply voltage $U_s = ${formatNum(solved.result.supplyVolts)}\\,\\mathrm{V}$.}`)
      lines.push('')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.5\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      lines.push(`R_{\\mathrm{eq}} &= ${formatNum(solved.result.totalOhms)}\\,\\Omega \\\\`)
      lines.push(`I &= \\frac{U_s}{R_{\\mathrm{eq}}} = \\frac{${formatNum(solved.result.supplyVolts)}}{${formatNum(solved.result.totalOhms)}} = ${formatNum(solved.result.totalCurrentA)}\\,\\mathrm{A} \\\\`)
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
      lines.push('')

      lines.push('\\subsection*{Resistances}')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.8\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      for (const r of solved.result.resistors) {
        lines.push(`R_{${r.index}} &= ${formatNum(r.ohms)}\\,\\Omega \\\\`)
      }
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
      lines.push('')

      lines.push('\\subsection*{Currents}')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.8\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      for (const r of solved.result.resistors) {
        lines.push(`I_{${r.index}} &= ${r.currentFormulaLatex} \\\\`)
      }
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
      lines.push('')

      lines.push('\\subsection*{Voltages on resistors}')
      lines.push('\\begin{center}')
      lines.push('\\begin{adjustbox}{max totalsize={0.95\\linewidth}{0.8\\textheight},center}')
      lines.push('{\\small $\\displaystyle')
      lines.push('\\begin{aligned}')
      for (const r of solved.result.resistors) {
        lines.push(
          `U_{${r.index}} &= I_{${r.index}}\\cdot R_{${r.index}} = ${formatNum(r.currentA)}\\cdot ${formatNum(r.ohms)} = ${formatNum(r.voltageV)}\\,\\mathrm{V} \\\\`,
        )
      }
      lines.push('\\end{aligned}')
      lines.push('$}')
      lines.push('\\end{adjustbox}')
      lines.push('\\end{center}')
    }
    lines.push('')
  }

  lines.push('\\end{document}')
  return lines.join('\n')
}
