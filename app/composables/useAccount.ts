/** The signed-in account's email, or null. Loaded once by the auth middleware. */
export const useAccount = () => useState<string | null | undefined>('account', () => undefined)

export async function signOut() {
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  useAccount().value = null
  clearNuxtData()
  await navigateTo('/sign-in')
}
