import type { UsageSnapshot } from '../storage/historyDb'
import { isIdentifying } from './usageView'

const CSV_HEADER = 'account,fetchedAt,window,utilization,resetsAt,status,ok,error'

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function snapshotsToCsv(snapshots: UsageSnapshot[], names: Record<string, string>): string {
  const rows: string[] = [CSV_HEADER]
  for (const s of snapshots) {
    const account = names[s.accountId] ?? s.accountId
    if (s.ok && s.parsed) {
      for (const w of s.parsed.windows) {
        rows.push(
          [account, s.fetchedAt, w.key, w.utilization, w.resetsAt, w.status, true, ''].map(csvCell).join(','),
        )
      }
    } else {
      const err = s.error ? `${s.error.status ?? ''} ${s.error.message}`.trim() : ''
      rows.push([account, s.fetchedAt, '', '', '', '', false, err].map(csvCell).join(','))
    }
  }
  return rows.join('\n')
}

export function snapshotsToJson(
  snapshots: UsageSnapshot[],
  names: Record<string, string>,
  includeIdentifying: boolean,
): string {
  const out = snapshots.map((s) => {
    const { id: _id, ...rest } = s
    const parsed = rest.parsed
      ? {
          ...rest.parsed,
          raw: includeIdentifying
            ? rest.parsed.raw
            : Object.fromEntries(Object.entries(rest.parsed.raw).filter(([k]) => !isIdentifying(k))),
        }
      : null
    return { account: names[s.accountId] ?? s.accountId, ...rest, parsed }
  })
  return JSON.stringify(out, null, 2)
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
