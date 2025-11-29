export interface Coordinate {
  lat: number
  lng: number
}

export interface User {
  _id: string
  name: string
  email: string
}

export interface Territory {
  _id: string
  name: string
  userId: string
  coordinates: Coordinate[][]
  area?: number
  color?: string
  description?: string
}
