/**
 * Behaviour shared by Orbit's small header menus: focus moves into the menu on open, arrow
 * keys move between items, Escape closes and returns focus, Tab or a click outside closes.
 */
export function useMenu() {
  const open = ref(false)
  const root = ref<HTMLElement | null>(null)
  const trigger = ref<HTMLButtonElement | null>(null)
  const menu = ref<HTMLElement | null>(null)
  const items = () => [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]

  async function show() {
    open.value = true
    await nextTick()
    items()[0]?.focus()
  }

  function close(returnFocus = true) {
    open.value = false
    if (returnFocus) trigger.value?.focus()
  }

  function toggle() {
    open.value ? close() : show()
  }

  function onKeydown(event: KeyboardEvent) {
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') close()
    else if (event.key === 'ArrowDown') list[(at + 1) % list.length]?.focus()
    else if (event.key === 'ArrowUp') list[(at - 1 + list.length) % list.length]?.focus()
    else if (event.key === 'Tab') close(false)
    else return
    event.preventDefault()
  }

  function onClickOutside(event: MouseEvent) {
    if (open.value && !root.value?.contains(event.target as Node)) close(false)
  }
  onMounted(() => document.addEventListener('click', onClickOutside))
  onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))

  return { open, root, trigger, menu, show, close, toggle, onKeydown }
}
