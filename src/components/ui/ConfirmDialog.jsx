import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import Alert from './Alert'
import { TextField } from './Field'

// Confirmation for destructive actions. With `confirmText`, the user must type it to enable the button.
export default function ConfirmDialog({ open, title, description, confirmLabel, confirmText, onConfirm, onClose }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function close() {
    setTyped('')
    setError(null)
    onClose()
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      setTyped('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const blocked = confirmText !== undefined && typed !== confirmText

  return (
    <Modal open={open} title={title} description={description} onClose={close}>
      <div className="space-y-4">
        <Alert>{error}</Alert>
        {confirmText !== undefined && (
          <TextField
            label={`Type "${confirmText}" to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="sm:w-auto" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" className="sm:w-auto" onClick={confirm} loading={busy} disabled={blocked}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
