'use server'

import { db } from '@/src/lib/db'
import { Territory } from '@/src/models/territories'
import { revalidatePath } from 'next/cache'
import { Coordinate } from '@/src/types'

export async function createTerritory(data: {
  name: string
  userId: string
  coordinates: Coordinate[]
  color: string
}) {
  console.log('🔵 createTerritory llamada con:', { name: data.name, userId: data.userId, coordsLength: data.coordinates.length })
  try {
    await db()
    console.log('🔵 Conexión a DB establecida')
    
    const territory = await Territory.create({
      name: data.name,
      userId: data.userId,
      coordinates: [data.coordinates], // Envolver en array para el formato Coordinate[][]
      color: data.color,
      area: 0
    })

    console.log('✅ Territorio creado con ID:', territory._id.toString())
    revalidatePath('/')
    return { success: true, id: territory._id.toString() }
  } catch (error) {
    console.error('❌ Error al crear territorio:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Error al crear territorio' }
  }
}

export async function updateTerritory(id: string, coordinates: Coordinate[]) {
  try {
    await db()
    
    await Territory.findByIdAndUpdate(id, { coordinates: [coordinates] }) // Envolver en array

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error al actualizar territorio' }
  }
}

export async function deleteTerritory(id: string) {
  try {
    await db()
    
    await Territory.findByIdAndDelete(id)

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error al eliminar territorio' }
  }
}

export async function deleteTerritories(ids: string[]) {
  try {
    await db()
    
    await Territory.deleteMany({ _id: { $in: ids } })

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error al eliminar territorios' }
  }
}
