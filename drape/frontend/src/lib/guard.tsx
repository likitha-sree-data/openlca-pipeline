import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui'

/** Warn before leaving with unsaved changes: in-app navigation and browser close or refresh. */
export function useUnsavedGuard(dirty: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      body="You have changes that are not saved yet. If you leave now, they will be lost."
      confirmLabel="Leave without saving"
      cancelLabel="Stay on this page"
      danger
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  )
  return dialog
}
