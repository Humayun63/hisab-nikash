import { useEffect } from 'react'

export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Hisab Nikash` : 'Hisab Nikash'
  }, [title])
}
