import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ApiError,
  request,
  uploadImage,
  useRecipe,
  useTags,
  type Recipe,
  type RecipeInput,
} from '../api'
import { ImageDropzone } from '../components/ImageDropzone'
import {
  IngredientEditor,
  emptyIngredient,
  fromIngredientDraft,
  hasIngredientContent,
  toIngredientDraft,
  type IngredientDraft,
} from '../components/IngredientEditor'
import { StepEditor, emptyStep, type StepDraft } from '../components/StepEditor'
import { TagInput } from '../components/TagInput'
import { Button, Card, ErrorBox, Field, FullPageLoader, Input, Textarea } from '../components/ui'

interface FormState {
  title: string
  description: string
  servings: string
  prepMinutes: string
  cookMinutes: string
  sourceUrl: string
  notes: string
}

const emptyForm: FormState = {
  title: '',
  description: '',
  servings: '',
  prepMinutes: '',
  cookMinutes: '',
  sourceUrl: '',
  notes: '',
}

function intOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toForm(recipe: Recipe): FormState {
  return {
    title: recipe.title,
    description: recipe.description ?? '',
    servings: recipe.servings === null ? '' : String(recipe.servings),
    prepMinutes: recipe.prepMinutes === null ? '' : String(recipe.prepMinutes),
    cookMinutes: recipe.cookMinutes === null ? '' : String(recipe.cookMinutes),
    sourceUrl: recipe.sourceUrl ?? '',
    notes: recipe.notes ?? '',
  }
}

export default function RecipeFormPage(): React.ReactNode {
  const { slug } = useParams()
  const isEdit = Boolean(slug)
  const existing = useRecipe(slug)
  const tagsQuery = useTags()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [tags, setTags] = useState<string[]>([])
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()])
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const loadedSlug = useRef<string | null>(null)

  useEffect(() => {
    const recipe = existing.data
    if (!recipe || loadedSlug.current === recipe.slug) return
    loadedSlug.current = recipe.slug
    setForm(toForm(recipe))
    setTags(recipe.tags)
    setIngredients(
      recipe.ingredients.length > 0 ? recipe.ingredients.map(toIngredientDraft) : [emptyIngredient()],
    )
    setSteps(recipe.steps.length > 0 ? recipe.steps.map((step) => ({ section: step.section ?? '', text: step.text })) : [emptyStep()])
  }, [existing.data])

  const save = useMutation({
    mutationFn: async () => {
      const payload: RecipeInput = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        servings: intOrNull(form.servings),
        prepMinutes: intOrNull(form.prepMinutes),
        cookMinutes: intOrNull(form.cookMinutes),
        sourceUrl: form.sourceUrl.trim() || null,
        notes: form.notes.trim() || null,
        tags,
        ingredients: ingredients.filter(hasIngredientContent).map(fromIngredientDraft),
        steps: steps
          .filter((step) => step.text.trim().length > 0)
          .map((step) => ({ section: step.section.trim() || null, text: step.text.trim() })),
      }

      const saved = isEdit
        ? await request<Recipe>('PUT', `/api/recipes/${slug}`, payload)
        : await request<Recipe>('POST', '/api/recipes', payload)

      if (imageFile) await uploadImage(saved.slug, imageFile)
      if (removeImage && isEdit) await request<void>('DELETE', `/api/recipes/${saved.slug}/image`)

      return saved
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      await queryClient.invalidateQueries({ queryKey: ['recipe', saved.slug] })
      await queryClient.invalidateQueries({ queryKey: ['tags'] })
      navigate(`/recipes/${saved.slug}`, { replace: true })
    },
  })

  if (isEdit && existing.isLoading) return <FullPageLoader />
  if (isEdit && existing.isError) {
    return <ErrorBox message="That recipe could not be loaded." />
  }

  const error = save.error
  const errorMessage =
    error instanceof ApiError
      ? `${error.message}${error.details && error.details.length > 0 ? `: ${error.details.map((detail) => detail.message).join('; ')}` : ''}`
      : error
        ? 'Could not save the recipe.'
        : null

  const update = (patch: Partial<FormState>): void => setForm((current) => ({ ...current, ...patch }))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? 'Edit recipe' : 'New recipe'}
        </h1>
        <Link to={isEdit ? `/recipes/${slug}` : '/recipes'} className="text-sm text-stone-500 hover:underline">
          Cancel
        </Link>
      </div>

      {errorMessage ? <ErrorBox message={errorMessage} /> : null}

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Card className="space-y-4">
          <Field label="Title">
            <Input
              name="title"
              required
              maxLength={200}
              value={form.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </Field>

          <Field label="Description">
            <Textarea
              name="description"
              rows={2}
              maxLength={2000}
              value={form.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Servings">
              <Input
                name="servings"
                type="number"
                min={1}
                max={1000}
                value={form.servings}
                onChange={(event) => update({ servings: event.target.value })}
              />
            </Field>
            <Field label="Prep (minutes)">
              <Input
                name="prepMinutes"
                type="number"
                min={0}
                max={10080}
                value={form.prepMinutes}
                onChange={(event) => update({ prepMinutes: event.target.value })}
              />
            </Field>
            <Field label="Cook (minutes)">
              <Input
                name="cookMinutes"
                type="number"
                min={0}
                max={10080}
                value={form.cookMinutes}
                onChange={(event) => update({ cookMinutes: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Source URL" hint="Optional link to where the recipe came from.">
            <Input
              name="sourceUrl"
              type="url"
              maxLength={500}
              placeholder="https://…"
              value={form.sourceUrl}
              onChange={(event) => update({ sourceUrl: event.target.value })}
            />
          </Field>

          <Field label="Tags">
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={(tagsQuery.data?.tags ?? []).map((entry) => entry.tag)}
            />
          </Field>

          <Field label="Photo">
            <ImageDropzone
              file={imageFile}
              existingUrl={existing.data?.image?.fullUrl ?? null}
              onChange={setImageFile}
              onRemoveExisting={() => setRemoveImage(true)}
              existingRemoved={removeImage}
            />
          </Field>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Ingredients</h2>
          <IngredientEditor ingredients={ingredients} onChange={setIngredients} />
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Steps</h2>
          <StepEditor steps={steps} onChange={setSteps} />
        </Card>

        <Card>
          <Field label="Notes">
            <Textarea
              name="notes"
              rows={5}
              maxLength={10000}
              value={form.notes}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </Field>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create recipe'}
          </Button>
          <Link to={isEdit ? `/recipes/${slug}` : '/recipes'} className="text-sm text-stone-500 hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
