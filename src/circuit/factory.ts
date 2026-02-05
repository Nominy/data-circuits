import { newId } from './id'
import type { Ammeter, Circuit, CurrentSource, ParallelBlock, ParallelBranch, Resistor, SeriesBlock, VoltageSource } from './model'

export function createCircuit(): Circuit {
  return { kind: 'circuit', id: newId('circuit'), route: { mode: 'u' }, top: [], right: [], bottom: [] }
}

export function createResistor(ohms = 100): Resistor {
  return { kind: 'resistor', id: newId('r'), ohms }
}

export function createEquivalentResistor(ohms: number, eqName?: string): Resistor {
  return { kind: 'resistor', id: newId('req'), ohms, name: eqName, generated: true }
}

export function createAmmeter(): Ammeter {
  return { kind: 'ammeter', id: newId('a') }
}

export function createVoltageSource(volts = 5): VoltageSource {
  return { kind: 'vsource', id: newId('vs'), volts }
}

export function createCurrentSource(amps = 0.01): CurrentSource {
  return { kind: 'isource', id: newId('is'), amps }
}

export function createSeriesBlock(): SeriesBlock {
  return { kind: 'series', id: newId('s'), items: [] }
}

export function createParallelBranch(): ParallelBranch {
  return { id: newId('b'), items: [] }
}

export function createParallelBlock(): ParallelBlock {
  return { kind: 'parallel', id: newId('p'), branches: [createParallelBranch(), createParallelBranch()] }
}
