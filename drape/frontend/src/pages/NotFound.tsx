import { Link } from 'react-router-dom'
import { EmptyState, PageHeader } from '@/components/ui'

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found." />
      <EmptyState
        title="This page does not exist."
        body="The link may be old or mistyped."
        action={<Link to="/" className="btn-primary">Go to Home</Link>}
      />
    </>
  )
}
