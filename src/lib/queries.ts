import { db } from '@/src/lib/db'
import { User, IUser } from '@/src/models/users'
import { Territory, ITerritory } from '@/src/models/territories'
import { Types } from 'mongoose'

export async function getUsers() {
  try {
    await db()
    const users = await User.find({}).select('_id name email').lean<(Pick<IUser, 'name' | 'email'> & { _id: Types.ObjectId })[]>()
    return users.map((user) => ({
      _id: user._id.toString(),
      email: user.email,
      name: user.name
    }))
  } catch {
    return []
  }
}

export async function getTerritories(userId?: string) {
  try {
    await db()
    const query = userId ? { userId } : {}
    const territories = await Territory.find(query).lean<(ITerritory & { _id: Types.ObjectId })[]>()
    return territories.map((territory) => ({
      _id: territory._id.toString(),
      name: territory.name,
      userId: territory.userId.toString(),
      coordinates: JSON.parse(JSON.stringify(territory.coordinates)),
      area: territory.area || 0,
      color: territory.color || '#3B82F6',
      description: territory.description || ''
    }))
  } catch {
    return []
  }
}
