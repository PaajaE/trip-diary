import { z } from 'zod'

export const emailSchema = z.email()
export const passwordSchema = z.string().min(8).max(72)
export const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/)

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const signUpSchema = signInSchema
  .extend({
    confirmPassword: passwordSchema,
    username: usernameSchema,
  })
  .refine(({ confirmPassword, password }) => confirmPassword === password, {
    message: 'passwordsDoNotMatch',
    path: ['confirmPassword'],
  })

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
