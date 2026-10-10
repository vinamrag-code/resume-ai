import { scoreStroke } from './scoreTone'

interface Props {
  value: number
  size?: number
  label?: string
}

/** Circular progress gauge (SVG). The arc length is proportional to the 0-100 score. */
export function ScoreGauge({ value, size = 168, label = 'Overall ATS score' }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const stroke = Math.round(size / 11)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const verdict = v >= 75 ? 'Strong' : v >= 50 ? 'Fair' : 'Needs work'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${v} out of 100, ${verdict}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ink-200 dark:stroke-ink-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className={`${scoreStroke(v)} transition-[stroke-dashoffset] duration-700 ease-out`}
          data-testid="gauge-arc"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-4xl font-bold leading-none">{v}</span>
        <span className="mt-1 text-xs text-ink-500 dark:text-ink-400">out of 100</span>
        <span className="mt-1 text-xs font-semibold">{verdict}</span>
      </div>
    </div>
  )
}
