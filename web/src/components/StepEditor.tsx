import { Button, Input, Textarea, labelClass } from './ui'

export interface StepDraft {
  section: string
  text: string
}

export const emptyStep = (): StepDraft => ({ section: '', text: '' })

export function StepEditor({
  steps,
  onChange,
}: {
  steps: StepDraft[]
  onChange: (steps: StepDraft[]) => void
}): React.ReactNode {
  const update = (index: number, patch: Partial<StepDraft>): void => {
    onChange(steps.map((step, current) => (current === index ? { ...step, ...patch } : step)))
  }

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const copy = [...steps]
    const [item] = copy.splice(index, 1)
    if (item) copy.splice(target, 0, item)
    onChange(copy)
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={index} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <div className="flex items-start gap-2">
            <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-bright)]">
              {index + 1}
            </span>
            <div className="flex-1 space-y-2">
              <div>
                <span className={labelClass}>Group</span>
                <Input
                  aria-label={`Step ${index + 1} group`}
                  placeholder="Optional, e.g. For the sauce"
                  maxLength={80}
                  value={step.section}
                  onChange={(event) => update(index, { section: event.target.value })}
                />
              </div>
              <div>
                <span className={labelClass}>Step</span>
                <Textarea
                  aria-label={`Step ${index + 1} text`}
                  rows={2}
                  maxLength={5000}
                  value={step.text}
                  onChange={(event) => update(index, { text: event.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-1">
            <Button type="button" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}>
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => move(index, 1)}
              disabled={index === steps.length - 1}
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(steps.filter((_, current) => current !== index))}
              disabled={steps.length === 1}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" onClick={() => onChange([...steps, emptyStep()])}>
        Add step
      </Button>
    </div>
  )
}
