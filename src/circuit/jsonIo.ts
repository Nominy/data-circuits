import { z } from 'zod'

import { newId } from './id'
import { circuitSchema, type Circuit } from './model'

type ParseOk = { ok: true; circuit: Circuit }
type ParseErr = { ok: false; error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function migrateCircuitData(input: unknown): unknown {
  if (!isObject(input)) return input

  const kind = input.kind
  if (kind !== 'circuit') return input

  const id = typeof input.id === 'string' ? input.id : newId('circuit')

  const hasSegmentLists =
    Array.isArray(input.top) || Array.isArray(input.right) || Array.isArray(input.bottom)

  const routeCandidate = input['route']
  const routeRaw = isObject(routeCandidate) ? routeCandidate : undefined
  const modeRaw: unknown = routeRaw ? routeRaw['mode'] : undefined

  // Legacy: route absent -> infer
  let mode: 'straight' | 'u'
  if (modeRaw === 'straight' || modeRaw === 'u') mode = modeRaw
  else if (modeRaw === 'two-bend') mode = 'u'
  else mode = hasSegmentLists ? 'u' : 'straight'

  if (mode === 'straight') {
    const items = Array.isArray(input.items)
      ? input.items
      : Array.isArray(input.bottom)
        ? input.bottom
        : []
    return { kind: 'circuit', id, route: { mode }, items }
  }

  // mode === 'u'
  // Legacy: if only items exist, place them on bottom segment.
  const top = Array.isArray(input.top) ? input.top : []
  const right = Array.isArray(input.right) ? input.right : []
  const bottom = Array.isArray(input.bottom)
    ? input.bottom
    : Array.isArray(input.items)
      ? input.items
      : []
  return { kind: 'circuit', id, route: { mode }, top, right, bottom }
}

export function exportCircuitJson(circuit: Circuit): string {
  const stable =
    circuit.route.mode === 'u'
      ? { kind: 'circuit', id: circuit.id, route: circuit.route, top: circuit.top ?? [], right: circuit.right ?? [], bottom: circuit.bottom ?? [] }
      : { kind: 'circuit', id: circuit.id, route: circuit.route, items: circuit.items ?? [] }
  return JSON.stringify(stable, null, 2)
}

export function parseCircuitJson(text: string): ParseOk | ParseErr {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Invalid JSON.' }
  }

  const migrated = migrateCircuitData(parsed)
  const result = circuitSchema.safeParse(migrated)
  if (result.success) return { ok: true, circuit: result.data }

  const msg = fromZodError(result.error)
  return { ok: false, error: msg }
}

function fromZodError(err: z.ZodError): string {
  const issue = err.issues[0]
  if (!issue) return 'Invalid circuit JSON.'
  const path = issue.path.length ? issue.path.join('.') : '(root)'
  return `${path}: ${issue.message}`
}
