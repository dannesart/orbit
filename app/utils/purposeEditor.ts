import { computed, ref } from 'vue'

/** The same limit the server and the database hold the purpose to (DESCRIPTION_MAX). */
export const PURPOSE_MAX = 280

/**
 * What a draft asks the server to store: tidied the way the server tidies it, and nothing when
 * it is empty. An empty purpose is a valid answer, and it clears the purpose.
 */
export const purposeToSave = (draft: string) => draft.trim().replace(/\s+/g, ' ') || null

/**
 * The behaviour of editing a workspace's purpose in its own small dialog, apart from the dialog
 * element itself: opening starts from the current purpose, dismissing never sends anything, and
 * saving goes through the one save() the whole workspace uses. A failed save keeps what was typed
 * and stays open; a save already in flight can be neither repeated nor dismissed.
 */
export function createPurposeEditor(options: {
  current: () => string | null
  save: (changes: { description: string | null }) => Promise<unknown>
}) {
  const open = ref(false)
  const draft = ref('')
  const error = ref('')
  const saving = ref(false)
  const remaining = computed(() => PURPOSE_MAX - [...draft.value].length)

  function start() {
    if (open.value) return
    draft.value = options.current() ?? ''
    error.value = ''
    open.value = true
  }

  /** Cancel, Escape or the backdrop. Returns false, and stays open, while a save is in flight. */
  function cancel() {
    if (saving.value) return false
    open.value = false
    return true
  }

  /** Returns whether the purpose was saved (and the editor closed). */
  async function submit() {
    if (!open.value || saving.value) return false
    error.value = ''
    saving.value = true
    try {
      await options.save({ description: purposeToSave(draft.value) })
      open.value = false
      return true
    } catch (e: any) {
      error.value = e?.data?.statusMessage || 'That didn’t save. Please try again.'
      return false
    } finally {
      saving.value = false
    }
  }

  return { open, draft, error, saving, remaining, start, cancel, submit }
}
