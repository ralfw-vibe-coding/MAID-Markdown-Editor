import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  const onDelete = vi.fn()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const root = createRoot(host)
  act(() => root.render(createElement(ConfirmDeleteButton, { label: 'Thread löschen', onDelete })))
  const button = () => host.querySelector('button')!
  return { onDelete, button }
}

describe('Papierkorb mit Rückfrage', () => {
  it('erster Klick zeigt „?“, zweiter löscht', () => {
    const { onDelete, button } = mount()
    act(() => button().click())
    expect(onDelete).not.toHaveBeenCalled()
    expect(button().className).toContain('armed')
    act(() => button().click())
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('Klick woanders nimmt die Rückfrage zurück', () => {
    const { onDelete, button } = mount()
    act(() => button().click())
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(button().className).not.toContain('armed')
    act(() => button().click())
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('Esc nimmt die Rückfrage zurück', () => {
    const { button } = mount()
    act(() => button().click())
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(button().className).not.toContain('armed')
  })
})
