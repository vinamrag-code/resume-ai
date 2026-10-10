export function scoreTone(value: number): string {
  return value >= 75
    ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100'
    : value >= 50
      ? 'bg-spark-400/25 text-ink-800 dark:text-spark-400'
      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
}

/** Stroke colour class for the circular gauge. */
export function scoreStroke(value: number): string {
  return value >= 75 ? 'stroke-brand-500' : value >= 50 ? 'stroke-spark-500' : 'stroke-red-500'
}
