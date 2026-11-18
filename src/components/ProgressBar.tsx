export interface ProgressBarProps {
  value: number
  max: number
  percent: number
  label: string
}

/** Accessible progress bar using the native <progress> element, styled with Tailwind. */
export function ProgressBar({ value, max, percent, label }: ProgressBarProps) {
  const safeMax = Math.max(max, 1)
  const clampedValue = Math.min(Math.max(value, 0), safeMax)
  const reachedTarget = max > 0 && value >= max

  return (
    <div className="flex flex-col gap-1">
      <progress
        aria-label={label}
        value={clampedValue}
        max={safeMax}
        className={[
          'h-2 w-full appearance-none overflow-hidden rounded-full bg-slate-200',
          '[&::-webkit-progress-bar]:bg-slate-200',
          reachedTarget
            ? '[&::-moz-progress-bar]:bg-emerald-500 [&::-webkit-progress-value]:bg-emerald-500'
            : '[&::-moz-progress-bar]:bg-indigo-500 [&::-webkit-progress-value]:bg-indigo-500',
        ].join(' ')}
      />
      <p className="text-sm text-slate-600" data-testid="progress-text">
        {value} of {max} ({percent}%)
      </p>
    </div>
  )
}
