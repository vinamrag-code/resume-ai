export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFilename(name: string, ext: string): string {
  const base = name.trim().replace(/[^a-z0-9-_ ]+/gi, '').replace(/\s+/g, '-').slice(0, 60) || 'resume'
  return `${base}.${ext}`
}

/** PDF export uses the browser print dialog ("Save as PDF"); print CSS limits output to `.print-area`. */
export function printToPdf(): void {
  window.print()
}
