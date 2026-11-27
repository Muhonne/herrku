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

export const inputClass = 'input'
export const labelClass = 'label block'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): ReactNode {
  return <button className={cx('btn', variants[variant], className)} {...props} />
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  const { className, ...rest } = props
  return <input className={cx('input', className)} {...rest} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  const { className, ...rest } = props
  return <textarea className={cx('input', className)} {...rest} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  const { className, ...rest } = props
  return <select className={cx('input', className)} {...rest} />
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
      <span className="label block">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
      {error ? <span className="block text-xs text-[#ffb3a2]">{error}</span> : null}
    </label>
  )
}

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): ReactNode {
  return <div className={cx('panel p-5', className)}>{children}</div>
}

export function Switch({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  name?: string
}): ReactNode {
  return (
    <label className="switch text-sm text-[var(--text-soft)]">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
      <span>{label}</span>
    </label>
  )
}

export function Spinner(): ReactNode {
  return <span aria-label="Loading" className="spinner" />
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
    <div className="empty">
      <p className="text-base font-medium text-[var(--text)]">{title}</p>
      {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function ErrorBox({ message }: { message: string }): ReactNode {
  return (
    <p role="alert" className="error-box">
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
        <div role="status" className="toast">
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
