import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

test('Shiki loads Typst and embedded language grammars with dual themes', async () => {
  const moduleUrl = pathToFileURL(resolve(import.meta.dirname, '../src/client/highlight.ts')).href
  const syntax = await import(moduleUrl)
  void syntax.ensureSyntaxHighlighter()
  if (syntax.getSyntaxHighlighter() === null) {
    await new Promise((resolveReady) => {
      const unsubscribe = syntax.subscribeSyntax(() => {
        unsubscribe()
        resolveReady()
      })
    })
  }
  const highlighter = syntax.getSyntaxHighlighter()
  assert.ok(highlighter)
  assert.ok(highlighter.getLoadedLanguages().includes('typst'))
  assert.ok(highlighter.getLoadedLanguages().includes('rust'))
  const lines = highlighter.codeToTokensWithThemes('#let answer = 42', {
    lang: 'typst',
    themes: { light: 'github-light', dark: 'github-dark' },
  })
  assert.equal(lines.length, 1)
  assert.equal(lines[0][0].content, '#let')
  assert.match(lines[0][0].variants.light.color, /^#[0-9A-F]{6}$/i)
  assert.match(lines[0][0].variants.dark.color, /^#[0-9A-F]{6}$/i)
})
