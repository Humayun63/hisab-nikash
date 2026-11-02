import { Link } from 'react-router-dom'
import FullPageMessage from '../components/ui/FullPageMessage'

export default function NotFoundPage() {
  return (
    <FullPageMessage title="Page not found">
      <Link to="/" className="text-sm font-medium text-emerald-700 hover:underline">
        Go home
      </Link>
    </FullPageMessage>
  )
}
