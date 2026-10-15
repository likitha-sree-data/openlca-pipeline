import { Component, type ReactNode } from 'react'

/** Last line of defence: a screen crashed. Say what happened and how to recover. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-16">
        <p className="font-serif text-[32px]">Drape</p>
        <h1 className="section-title mt-6">This screen stopped working.</h1>
        <p className="mt-2 text-[15px] text-ink2">Your saved data is safe. Reload the page to continue. If it happens again, go back to Home.</p>
        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Reload</button>
          <a href="/" className="btn-secondary">Go to Home</a>
        </div>
      </main>
    )
  }
}
