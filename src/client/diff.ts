export type DiffRowClass = 'gap' | 'empty' | 'add' | 'del' | 'ctx'

export interface DiffInlineRange {
  start: number
  end: number
}

export interface DiffRow {
  cls: DiffRowClass
  old: string
  neu: string
  text: string
  count?: number
  inline?: DiffInlineRange[]
}

export interface SplitDiffRow {
  kind: 'line' | 'wide'
  oldLine: string
  newLine: string
  oldText: string
  newText: string
  oldClass: DiffRowClass
  newClass: DiffRowClass
  gapCount?: number
  oldInline?: DiffInlineRange[]
  newInline?: DiffInlineRange[]
}

interface DiffUnit {
  value: string
  start: number
  end: number
}

function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

const MAX_INLINE_DIFF_CELLS = 4_000_000

function diffUnits(text: string): DiffUnit[] {
  const units: DiffUnit[] = []
  for (let start = 0; start < text.length;) {
    const codePoint = text.codePointAt(start)
    const end = start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)
    units.push({ value: text.slice(start, end), start, end })
    start = end
  }
  return units
}

function appendRange(ranges: DiffInlineRange[], start: number, end: number): void {
  const previous = ranges[ranges.length - 1]
  if (previous !== undefined && start <= previous.end) {
    previous.end = Math.max(previous.end, end)
  } else if (start < end) {
    ranges.push({ start, end })
  }
}

function prefixSuffixRanges(oldText: string, newText: string): { old: DiffInlineRange[]; neu: DiffInlineRange[] } {
  let prefix = 0
  while (prefix < oldText.length && prefix < newText.length && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix += 1
  let suffix = 0
  while (
    suffix < oldText.length - prefix
    && suffix < newText.length - prefix
    && oldText.charCodeAt(oldText.length - suffix - 1) === newText.charCodeAt(newText.length - suffix - 1)
  ) suffix += 1
  const oldEnd = oldText.length - suffix
  const newEnd = newText.length - suffix
  return {
    old: prefix < oldEnd ? [{ start: prefix, end: oldEnd }] : [],
    neu: prefix < newEnd ? [{ start: prefix, end: newEnd }] : [],
  }
}

export function inlineDiffRanges(oldText: string, newText: string): { old: DiffInlineRange[]; neu: DiffInlineRange[] } {
  if (oldText === newText || oldText === '' || newText === '') return { old: [], neu: [] }
  const oldUnits = diffUnits(oldText)
  const newUnits = diffUnits(newText)
  if ((oldUnits.length + 1) * (newUnits.length + 1) > MAX_INLINE_DIFF_CELLS) return prefixSuffixRanges(oldText, newText)

  // LCS keeps shared text aligned even when a deletion and insertion shift the suffix.
  const table = Array.from({ length: oldUnits.length + 1 }, () => new Uint32Array(newUnits.length + 1))
  for (let oldIndex = oldUnits.length - 1; oldIndex >= 0; oldIndex -= 1) {
    const row = table[oldIndex]!
    const next = table[oldIndex + 1]!
    for (let newIndex = newUnits.length - 1; newIndex >= 0; newIndex -= 1) {
      row[newIndex] = oldUnits[oldIndex]!.value === newUnits[newIndex]!.value
        ? next[newIndex + 1]! + 1
        : Math.max(next[newIndex]!, row[newIndex + 1]!)
    }
  }

  const old = [] as DiffInlineRange[]
  const neu = [] as DiffInlineRange[]
  let oldIndex = 0
  let newIndex = 0
  let oldStart: number | undefined
  let oldEnd: number | undefined
  let newStart: number | undefined
  let newEnd: number | undefined
  const flush = (): void => {
    if (oldStart !== undefined && oldEnd !== undefined) appendRange(old, oldStart, oldEnd)
    if (newStart !== undefined && newEnd !== undefined) appendRange(neu, newStart, newEnd)
    oldStart = undefined
    oldEnd = undefined
    newStart = undefined
    newEnd = undefined
  }
  const markOld = (unit: DiffUnit): void => {
    oldStart ??= unit.start
    oldEnd = unit.end
  }
  const markNew = (unit: DiffUnit): void => {
    newStart ??= unit.start
    newEnd = unit.end
  }

  while (oldIndex < oldUnits.length && newIndex < newUnits.length) {
    const oldUnit = oldUnits[oldIndex]!
    const newUnit = newUnits[newIndex]!
    if (oldUnit.value === newUnit.value) {
      flush()
      oldIndex += 1
      newIndex += 1
    } else if (table[oldIndex + 1]![newIndex]! >= table[oldIndex]![newIndex + 1]!) {
      markOld(oldUnit)
      oldIndex += 1
    } else {
      markNew(newUnit)
      newIndex += 1
    }
  }
  while (oldIndex < oldUnits.length) {
    markOld(oldUnits[oldIndex]!)
    oldIndex += 1
  }
  while (newIndex < newUnits.length) {
    markNew(newUnits[newIndex]!)
    newIndex += 1
  }
  flush()
  return { old, neu }
}

function markInlineDiffRows(rows: DiffRow[]): DiffRow[] {
  const marked = rows.map((row) => ({ ...row }))
  for (let index = 0; index < marked.length;) {
    const row = marked[index]
    if (row === undefined) break
    if (row.cls === 'gap' || row.cls === 'ctx' || row.cls === 'empty') {
      index += 1
      continue
    }
    const deleted: number[] = []
    const added: number[] = []
    while (marked[index]?.cls === 'del') { deleted.push(index); index += 1 }
    while (marked[index]?.cls === 'add') { added.push(index); index += 1 }
    for (let offset = 0; offset < Math.max(deleted.length, added.length); offset += 1) {
      const delIndex = deleted[offset]
      const addIndex = added[offset]
      const delText = delIndex === undefined ? '' : marked[delIndex]?.text ?? ''
      const addText = addIndex === undefined ? '' : marked[addIndex]?.text ?? ''
      const ranges = delIndex === undefined || addIndex === undefined
        ? { old: [], neu: [] }
        : inlineDiffRanges(delText, addText)
      if (delIndex !== undefined) marked[delIndex] = { ...marked[delIndex]!, inline: ranges.old }
      if (addIndex !== undefined) marked[addIndex] = { ...marked[addIndex]!, inline: ranges.neu }
    }
  }
  return marked
}

/** Parse a Git patch into display rows, omitting patch metadata. */
export function parseDiff(text: string): DiffRow[] {
  const out: DiffRow[] = []
  let oldN = 1
  let newN = 1
  let inHunk = false
  for (const raw of splitLines(text)) {
    const hunk = HUNK_HEADER.exec(raw)
    if (hunk) {
      const oldStart = Number(hunk[1])
      const newStart = Number(hunk[3])
      const skipped = Math.max(oldStart - oldN, newStart - newN, 0)
      if (skipped > 0) out.push({ cls: 'gap', old: '', neu: '', text: '', count: skipped })
      oldN = oldStart
      newN = newStart
      inHunk = true
      continue
    }

    // File headers, mode/index records, binary notices, and blank separators
    // carry patch metadata only. Keep only the colored rows inside a hunk.
    if (!inHunk || raw === '' || raw.indexOf('\\ No newline at end of file') === 0) continue
    if (raw.charAt(0) === '+') {
      out.push({ cls: 'add', old: '', neu: String(newN), text: raw.slice(1) })
      newN += 1
    } else if (raw.charAt(0) === '-') {
      out.push({ cls: 'del', old: String(oldN), neu: '', text: raw.slice(1) })
      oldN += 1
    } else if (raw.charAt(0) === ' ') {
      out.push({ cls: 'ctx', old: String(oldN), neu: String(newN), text: raw.slice(1) })
      oldN += 1
      newN += 1
    }
  }
  return markInlineDiffRows(out)
}

export function pairDiffRows(rows: DiffRow[]): SplitDiffRow[] {
  const paired: SplitDiffRow[] = []
  for (let index = 0; index < rows.length;) {
    const row = rows[index]
    if (row === undefined) break
    if (row.cls === 'gap') {
      paired.push({ kind: 'wide', oldLine: '', newLine: '', oldText: '', newText: '', oldClass: 'gap', newClass: 'gap', gapCount: row.count })
      index += 1
      continue
    }
    if (row.cls === 'ctx') {
      paired.push({ kind: 'line', oldLine: row.old, newLine: row.neu, oldText: row.text, newText: row.text, oldClass: 'ctx', newClass: 'ctx' })
      index += 1
      continue
    }
    if (row.cls === 'empty') {
      index += 1
      continue
    }

    const deleted: DiffRow[] = []
    const added: DiffRow[] = []
    while (rows[index]?.cls === 'del') { deleted.push(rows[index]!); index += 1 }
    while (rows[index]?.cls === 'add') { added.push(rows[index]!); index += 1 }
    const count = Math.max(deleted.length, added.length)
    for (let offset = 0; offset < count; offset += 1) {
      const del = deleted[offset]
      const add = added[offset]
      paired.push({
        kind: 'line',
        oldLine: del?.old ?? '',
        newLine: add?.neu ?? '',
        oldText: del?.text ?? '',
        newText: add?.text ?? '',
        oldClass: del === undefined ? 'empty' : 'del',
        newClass: add === undefined ? 'empty' : 'add',
        ...(del?.inline === undefined ? {} : { oldInline: del.inline }),
        ...(add?.inline === undefined ? {} : { newInline: add.inline }),
      })
    }
  }
  return paired
}
