import { Schema, model, models } from 'mongoose'
import { Coordinate } from '../types'

export interface ITerritory {
  name: string
  userId: string
  coordinates: Coordinate[]
  area?: number
  color?: string
  description?: string
  createdAt?: Date
  updatedAt?: Date
}

const TerritorySchema = new Schema<ITerritory>(
  {
    name: {
      type: String,
      required: [true, 'El nombre del territorio es requerido'],
      trim: true
    },
    userId: {
      type: String,
      required: [true, 'El usuario es requerido'],
      index: true
    },
    coordinates: {
      type: Schema.Types.Mixed,
      required: [true, 'Las coordenadas son requeridas']
    },
    area: {
      type: Number,
      default: 0
    },
    color: {
      type: String,
      default: '#3B82F6'
    },
    description: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
)

// Índice compuesto para búsquedas eficientes
TerritorySchema.index({ userId: 1, name: 1 })

export const Territory = models.Territory || model<ITerritory>('Territory', TerritorySchema)
