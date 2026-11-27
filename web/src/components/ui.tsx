import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-stone-100 disabled:text-stone-500'

export const labelClass = 'block text-sm font-medium text-stone-700'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-stone-600 hover:bg-stone-200',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): ReactNode {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  const { className, ...rest } = props
  return <input className={cx(inputClass, className)} {...rest} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  const { className, ...rest } = props
  return <textarea className={cx(inputClass, 'min-h-20', className)} {...rest} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  const { className, ...rest } = props
  return <select className={cx(inputClass, className)} {...rest} />
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}): ReactNode {
  return (
    <label className="block space-y-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-stone-500">{hint}</span> : null}
      {error ? <span className="block text-xs text-red-700">{error}</span> : null}
    </label>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <div className={cx('rounded-xl border border-stone-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function Spinner(): ReactNode {
  return (
    <span
      aria-label="Loading"
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-emerald-600"
    />
  )
}

export function FullPageLoader(): ReactNode {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
      <p className="text-base font-medium text-stone-800">{title}</p>
      {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function ErrorBox({ message }: { message: string }): ReactNode {
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  )
}

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((value: string) => {
    setMessage(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 3500)
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext)
}

export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Confirm',
  variant = 'danger',
  className,
  disabled,
}: {
  onConfirm: () => void
  children: ReactNode
  confirmLabel?: string
  variant?: Variant
  className?: string
  disabled?: boolean
}): ReactNode {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {children}
      </Button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="danger" onClick={onConfirm} disabled={disabled}>
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  )
}
