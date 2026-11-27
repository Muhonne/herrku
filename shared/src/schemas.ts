import { z } from 'zod'
import { UNIT_TOKENS } from './units.js'

const nullableTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value ?? null)

const nullableInt = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value ?? null)

const nullableQuantity = () =>
  z
    .number()
    .finite()
    .min(0)
    .max(1_000_000)
    .nullable()
    .optional()
    .transform((value) => value ?? null)

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lowercase letters, digits, - and _')

export const displayNameSchema = z.string().trim().min(1).max(80)
export const passwordSchema = z.string().min(12).max(200)

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(1024),
  staySignedIn: z.boolean().optional(),
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: passwordSchema,
})

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  username: usernameSchema.optional(),
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
})

export const inviteCreateSchema = z.object({
  role: z.enum(['admin', 'member']).default('member'),
})

export const userPatchSchema = z.object({
  role: z.enum(['admin', 'member']).optional(),
  disabled: z.boolean().optional(),
})

const tagSchema = z
  .string()
  .transform((value) => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase())
  .pipe(z.string().min(1).max(32))

const sectionSchema = nullableTrimmed(80)

export const ingredientInputSchema = z
  .object({
    section: sectionSchema,
    rawText: nullableTrimmed(500),
    quantity: nullableQuantity(),
    quantityMax: nullableQuantity(),
    unit: z
      .enum(UNIT_TOKENS)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    name: z.string().trim().max(200).optional().default(''),
    note: nullableTrimmed(200),
  })
  .superRefine((value, ctx) => {
    if (!value.name && !value.rawText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Provide a name or a raw ingredient line',
      })
    }
    if (value.quantity !== null && value.quantityMax !== null && value.quantityMax < value.quantity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityMax'],
        message: 'Maximum quantity must be greater than or equal to the minimum',
      })
    }
  })

export const stepInputSchema = z.object({
  section: sectionSchema,
  text: z.string().trim().min(1).max(5000),
})

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: nullableTrimmed(2000),
  servings: nullableInt(1, 1000),
  prepMinutes: nullableInt(0, 10080),
  cookMinutes: nullableInt(0, 10080),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\//i, 'Must be an http(s) URL')
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  notes: nullableTrimmed(10000),
  tags: z
    .array(tagSchema)
    .max(10)
    .optional()
    .default([])
    .transform((tags) => [...new Set(tags)]),
  ingredients: z.array(ingredientInputSchema).max(200).optional().default([]),
  steps: z.array(stepInputSchema).max(100).optional().default([]),
})

export const shoppingListSchema = z.object({
  items: z
    .array(
      z.object({
        recipeId: z.number().int().positive(),
        servings: nullableInt(1, 1000),
      }),
    )
    .min(1)
    .max(100),
})

export const apiTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RecipeInput = z.infer<typeof recipeInputSchema>
export type IngredientInput = z.infer<typeof ingredientInputSchema>
export type StepInput = z.infer<typeof stepInputSchema>
export type ShoppingListInput = z.infer<typeof shoppingListSchema>
export type UserPatchInput = z.infer<typeof userPatchSchema>
