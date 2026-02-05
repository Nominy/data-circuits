import { z } from 'zod'

export type Circuit = {
  kind: 'circuit'
  id: string
  route: RootRoute
  items?: Node[]
  top?: Node[]
  right?: Node[]
  bottom?: Node[]
}

export type RootRoute =
  | { mode: 'straight' }
  | { mode: 'u' }

export type Node = Resistor | Ammeter | VoltageSource | CurrentSource | SeriesBlock | ParallelBlock

export type Resistor = {
  kind: 'resistor'
  id: string
  name?: string
  ohms: number
  generated?: boolean
}

export type Ammeter = {
  kind: 'ammeter'
  id: string
  name?: string
}

export type VoltageSource = {
  kind: 'vsource'
  id: string
  name?: string
  volts: number
}

export type CurrentSource = {
  kind: 'isource'
  id: string
  name?: string
  amps: number
}

export type SeriesBlock = {
  kind: 'series'
  id: string
  name?: string
  items: Node[]
}

export type ParallelBranch = {
  id: string
  name?: string
  items: Node[]
}

export type ParallelBlock = {
  kind: 'parallel'
  id: string
  name?: string
  branches: ParallelBranch[]
}

export const resistorSchema = z.object({
  kind: z.literal('resistor'),
  id: z.string(),
  name: z.string().optional(),
  ohms: z.number().finite().positive(),
  generated: z.boolean().optional(),
})

export const ammeterSchema = z.object({
  kind: z.literal('ammeter'),
  id: z.string(),
  name: z.string().optional(),
})

export const voltageSourceSchema = z.object({
  kind: z.literal('vsource'),
  id: z.string(),
  name: z.string().optional(),
  volts: z.number().finite(),
})

export const currentSourceSchema = z.object({
  kind: z.literal('isource'),
  id: z.string(),
  name: z.string().optional(),
  amps: z.number().finite(),
})

export const seriesBlockSchema: z.ZodType<SeriesBlock> = z.lazy(() =>
  z.object({
    kind: z.literal('series'),
    id: z.string(),
    name: z.string().optional(),
    items: z.array(nodeSchema),
  }),
)

export const parallelBranchSchema: z.ZodType<ParallelBranch> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string().optional(),
    items: z.array(nodeSchema),
  }),
)

export const parallelBlockSchema: z.ZodType<ParallelBlock> = z.lazy(() =>
  z.object({
    kind: z.literal('parallel'),
    id: z.string(),
    name: z.string().optional(),
    branches: z.array(parallelBranchSchema),
  }),
)

export const nodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.union([resistorSchema, ammeterSchema, voltageSourceSchema, currentSourceSchema, seriesBlockSchema, parallelBlockSchema]),
)

export const circuitSchema: z.ZodType<Circuit> = z.object({
  kind: z.literal('circuit'),
  id: z.string(),
  route: z.union([z.object({ mode: z.literal('straight') }), z.object({ mode: z.literal('u') })]),
  items: z.array(nodeSchema).optional(),
  top: z.array(nodeSchema).optional(),
  right: z.array(nodeSchema).optional(),
  bottom: z.array(nodeSchema).optional(),
})

export type SeriesListKey =
  | 'root'
  | 'root:top'
  | 'root:right'
  | 'root:bottom'
  | `series:${string}`
  | `branch:${string}:${string}`

export function listKeyForSeriesBlock(seriesId: string): SeriesListKey {
  return `series:${seriesId}`
}

export function listKeyForBranch(
  parallelId: string,
  branchId: string,
): SeriesListKey {
  return `branch:${parallelId}:${branchId}`
}

export function isAtomic(node: Node): node is Resistor | Ammeter {
  return node.kind === 'resistor' || node.kind === 'ammeter'
}
