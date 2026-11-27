import { useState } from 'react'
import { cx } from './ui'

export function TagInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
}): React.ReactNode {
  const [draft, setDraft] = useState('')

  const addTag = (raw: string): void => {
    const tag = raw.normalize('NFC').trim().toLowerCase()
    if (!tag) return
    if (value.includes(tag)) {
      setDraft('')
      return
    }
    if (value.length >= 10) return
    onChange([...value, tag])
    setDraft('')
  }

  return (
    <div className="rounded-lg border border-stone-300 bg-white p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className={cx('inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900')}
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="text-emerald-700 hover:text-emerald-950"
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label="Add tag"
          className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-stone-400"
          placeholder={value.length === 0 ? 'Add a tag…' : ''}
          value={draft}
          maxLength={32}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => addTag(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              addTag(draft)
            }
            if (event.key === 'Backspace' && draft === '' && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
        />
      </div>
      {suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2">
          {suggestions
            .filter((tag) => !value.includes(tag))
            .slice(0, 12)
            .map((tag) => (
              <button
                key={tag}
                type="button"
                className="rounded-full border border-stone-200 px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
                onClick={() => addTag(tag)}
              >
                {tag}
              </button>
            ))}
        </div>
      ) : null}
      <p className="mt-1 text-xs text-stone-500">Up to 10 tags.</p>
    </div>
  )
}
