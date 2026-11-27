import { useState } from 'react'

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
    <div className="well p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="chip chip-active">
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="text-[var(--accent-bright)] hover:text-[var(--text)]"
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label="Add tag"
          className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[var(--muted-low)]"
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
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-2">
          {suggestions
            .filter((tag) => !value.includes(tag))
            .slice(0, 12)
            .map((tag) => (
              <button key={tag} type="button" className="chip" onClick={() => addTag(tag)}>
                {tag}
              </button>
            ))}
        </div>
      ) : null}
      <p className="mt-1 text-xs text-[var(--muted-low)]">Up to 10 tags.</p>
    </div>
  )
}
