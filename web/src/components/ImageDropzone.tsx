import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

export function ImageDropzone({
  file,
  existingUrl,
  onChange,
  onRemoveExisting,
  existingRemoved,
}: {
  file: File | null
  existingUrl: string | null
  onChange: (file: File | null) => void
  onRemoveExisting: () => void
  existingRemoved: boolean
}): React.ReactNode {
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shown = preview ?? (existingUrl && !existingRemoved ? existingUrl : null)

  return (
    <div className="space-y-2">
      {shown ? (
        <img src={shown} alt="" className="max-h-64 w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 text-sm text-stone-400">
          No photo
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          aria-label="Photo"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-200 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-stone-300"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null
            onChange(selected)
          }}
        />
        {file ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            Clear selection
          </Button>
        ) : null}
        {existingUrl && !existingRemoved && !file ? (
          <Button type="button" variant="ghost" onClick={onRemoveExisting}>
            Remove photo
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-stone-500">JPEG, PNG or WebP, up to 5 MB.</p>
    </div>
  )
}
