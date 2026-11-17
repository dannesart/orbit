export interface SignedInAccount {
  email: string
  /** What the person wants to be called; null until they tell us. */
  name: string | null
}

/** The signed-in account, or null when signed out. Loaded once by the auth middleware. */
export const useAccount = () => useState<SignedInAccount | null | undefined>('account', () => undefined)

export async function signOut() {
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  useAccount().value = null
  clearNuxtData()
  await navigateTo('/sign-in')
}
