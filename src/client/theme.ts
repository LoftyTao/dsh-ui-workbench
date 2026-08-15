import type { Context } from '../context-types.ts'

export type WorkbenchColorScheme = 'light' | 'dark'

export interface WorkbenchThemeSnapshot {
  active: { colorScheme: WorkbenchColorScheme }
}

export interface WorkbenchThemeRuntime {
  getTheme(): WorkbenchThemeSnapshot
}

interface ThemeContextFace {
  theme?: WorkbenchThemeRuntime
  on?: (event: string, listener: (snapshot: WorkbenchThemeSnapshot) => void) => unknown
}

function themeContext(ctx: Context): ThemeContextFace {
  return ctx as unknown as ThemeContextFace
}

function documentColorScheme(): WorkbenchColorScheme {
  if (typeof document !== 'undefined') {
    const rootScheme = document.documentElement.style.colorScheme
    if (rootScheme === 'dark' || rootScheme === 'light') return rootScheme
    if (typeof document.body?.hasAttribute === 'function' && document.body.hasAttribute('data-ds-dark-theme')) return 'dark'
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/** Observe the DOM projection so theme updates remain live without a theme injection. */
function subscribeDocumentTheme(listener: () => void): () => void {
  const disposers: Array<() => void> = []
  if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(listener)
    if (document.documentElement !== null) observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    if (document.body !== null) observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
    disposers.push(() => observer.disconnect())
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener)
      disposers.push(() => media.removeEventListener('change', listener))
    } else if (typeof media.addListener === 'function') {
      media.addListener(listener)
      disposers.push(() => media.removeListener(listener))
    }
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}

/** Read the resolved DSH theme, with a DOM fallback for isolated browser tests. */
export function getThemeColorScheme(ctx: Context): WorkbenchColorScheme {
  try {
    const scheme = themeContext(ctx).theme?.getTheme()?.active?.colorScheme
    if (scheme === 'dark' || scheme === 'light') return scheme
  } catch {
    // The DSH theme service can be unavailable while an isolated client shell boots.
  }
  return documentColorScheme()
}

/** Subscribe to DSH's service and DOM theme seams, keeping both paths disposable. */
export function subscribeTheme(ctx: Context, listener: () => void): () => void {
  const disposers: Array<() => void> = [subscribeDocumentTheme(listener)]
  const on = themeContext(ctx).on
  if (typeof on === 'function') {
    try {
      const off = on.call(ctx, 'theme/change', () => listener())
      if (typeof off === 'function') disposers.push(off as () => void)
    } catch {
      // The optional DSH theme service can be unavailable during an HMR handoff.
    }
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
