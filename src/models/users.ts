import { Schema, model, models } from 'mongoose'

export interface IUser {
  email: string
  name: string
  password: string
  createdAt?: Date
  updatedAt?: Date
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'El email es requerido'],
      unique: true,
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'El nombre es requerido'],
      trim: true
    },
    password: {
      type: String,
      required: [true, 'La contraseña es requerida'],
      minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
    }
  },
  {
    timestamps: true
  }
)

// Evita el error de modelo ya compilado en desarrollo
export const User = models.User || model<IUser>('User', UserSchema)
