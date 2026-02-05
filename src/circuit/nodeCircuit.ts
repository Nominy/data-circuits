import { z } from 'zod'

export type NodeCircuitNode = {
  id: string
  name?: string
  x: number
  y: number
}

export type NodeCircuitEdge =
  | {
      kind: 'wire'
      id: string
      name?: string
      a: string
      b: string
    }
  | {
      kind: 'resistor'
      id: string
      name?: string
      ohms: number
      a: string
      b: string
    }
  | {
      kind: 'ammeter'
      id: string
      name?: string
      a: string
      b: string
    }
  | {
      kind: 'vsource'
      id: string
      name?: string
      volts: number
      // Polarity: a = +, b = -
      a: string
      b: string
    }
  | {
      kind: 'isource'
      id: string
      name?: string
      amps: number
      // Direction: from a -> b
      a: string
      b: string
    }

export type NodeCircuit = {
  kind: 'node_circuit'
  id: string
  plusNodeId: string | null
  minusNodeId: string | null
  nodes: NodeCircuitNode[]
  edges: NodeCircuitEdge[]
}

export const nodeCircuitNodeSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  x: z.number().finite(),
  y: z.number().finite(),
})

export const nodeCircuitEdgeSchema: z.ZodType<NodeCircuitEdge> = z.union([
  z.object({
    kind: z.literal('wire'),
    id: z.string(),
    name: z.string().optional(),
    a: z.string(),
    b: z.string(),
  }),
  z.object({
    kind: z.literal('resistor'),
    id: z.string(),
    name: z.string().optional(),
    ohms: z.number().finite().positive(),
    a: z.string(),
    b: z.string(),
  }),
  z.object({
    kind: z.literal('ammeter'),
    id: z.string(),
    name: z.string().optional(),
    a: z.string(),
    b: z.string(),
  }),
  z.object({
    kind: z.literal('vsource'),
    id: z.string(),
    name: z.string().optional(),
    volts: z.number().finite(),
    a: z.string(),
    b: z.string(),
  }),
  z.object({
    kind: z.literal('isource'),
    id: z.string(),
    name: z.string().optional(),
    amps: z.number().finite(),
    a: z.string(),
    b: z.string(),
  }),
])

export const nodeCircuitSchema: z.ZodType<NodeCircuit> = z.object({
  kind: z.literal('node_circuit'),
  id: z.string(),
  plusNodeId: z.string().nullable(),
  minusNodeId: z.string().nullable(),
  nodes: z.array(nodeCircuitNodeSchema),
  edges: z.array(nodeCircuitEdgeSchema),
})
