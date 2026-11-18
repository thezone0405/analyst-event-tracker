export interface ProgressBarProps {
  value: number
  max: number
  percent: number
  label: string
}

const BASE_CLASSES =
  'h-2 w-full appearance-none overflow-hidden rounded-full bg-slate-200 [&::-webkit-progress-bar]:bg-slate-200'

const FILL_CLASSES = {
  reached: '[&::-moz-progress-bar]:bg-emerald-500 [&::-webkit-progress-value]:bg-emerald-500',
  inProgress: '[&::-moz-progress-bar]:bg-indigo-500 [&::-webkit-progress-value]:bg-indigo-500',
} as const

/** True when a positive target has been met or exceeded. */
export function hasReachedTarget(value: number, max: number): boolean {
  return max > 0 && value >= max
}

/** Tailwind classes for the bar; the fill turns green once the target is reached. */
export function progressClassName(value: number, max: number): string {
  const fill = hasReachedTarget(value, max) ? FILL_CLASSES.reached : FILL_CLASSES.inProgress
  return `${BASE_CLASSES} ${fill}`
}

/** Accessible progress bar using the native <progress> element, styled with Tailwind. */
export function ProgressBar({ value, max, percent, label }: ProgressBarProps) {
  const safeMax = Math.max(max, 1)
  const clampedValue = Math.min(Math.max(value, 0), safeMax)

  return (
    <div className="flex flex-col gap-1">
      <progress
        aria-label={label}
        value={clampedValue}
        max={safeMax}
        className={progressClassName(value, max)}
      />
      <p className="text-sm text-slate-600" data-testid="progress-text">
        {value} of {max} target ({percent}%)
      </p>
    </div>
  )
}
