import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthProvider'
import { setupSchema, setupWithNameSchema } from '../../lib/validation'
import { authErrorMessage } from '../../lib/authErrors'
import {
  CURRENCIES,
  DEFAULT_WEEK_START,
  WEEKDAYS,
  currencyByCode,
  defaultOrgName,
  defaultTimezone,
  timezoneOptions,
} from '../../lib/options'
import AuthLayout from '../../components/ui/AuthLayout'
import { SelectField, TextField } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

// First login of a newly verified super admin: create the organization and the first space.
export default function SetupPage() {
  const { user, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)
  const zones = useMemo(() => timezoneOptions(), [])
  const firstName = user.user_metadata?.first_name
  // Accounts created in the Supabase dashboard have no name; setup_organization needs one.
  const needsName = !firstName?.trim() || !user.user_metadata?.last_name?.trim()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(needsName ? setupWithNameSchema : setupSchema),
    mode: 'onTouched',
    defaultValues: {
      orgName: defaultOrgName(firstName),
      timezone: defaultTimezone(zones),
      weekStart: DEFAULT_WEEK_START,
      spaceName: 'General',
      currencyCode: 'BDT',
      firstName: '',
      lastName: '',
    },
  })

  async function onSubmit(values) {
    setServerError(null)
    if (needsName) {
      const { error } = await supabase.auth.updateUser({ data: { first_name: values.firstName, last_name: values.lastName } })
      if (error) {
        setServerError(authErrorMessage(error))
        return
      }
    }
    const currency = currencyByCode(values.currencyCode)
    const { error } = await supabase.rpc('setup_organization', {
      p_org_name: values.orgName,
      p_timezone: values.timezone,
      p_space_name: values.spaceName,
      p_currency_code: currency.code,
      p_currency_symbol: currency.symbol,
      p_week_start: values.weekStart,
    })
    if (error) {
      setServerError(authErrorMessage(error))
      if (error.code === '23505') await refreshProfile() // already set up, e.g. in another tab
      return
    }
    await refreshProfile()
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout
      title="Set up your organization"
      subtitle={`Welcome${firstName ? `, ${firstName}` : ''}! A few details and you're ready to go.`}
      footer={
        <button type="button" onClick={signOut} className="font-medium text-emerald-700 hover:underline">
          Sign out
        </button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Alert>{serverError}</Alert>
        {needsName && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
            <TextField label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
          </div>
        )}
        <TextField label="Organization name" error={errors.orgName?.message} {...register('orgName')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Timezone" error={errors.timezone?.message} {...register('timezone')}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </SelectField>
          <SelectField label="Week starts on" error={errors.weekStart?.message} {...register('weekStart')}>
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="text-sm font-semibold text-slate-900">Your first space</h2>
          <p className="mt-1 text-xs text-slate-500">
            A space holds folders, files and categories, e.g. &ldquo;Office&rdquo; or &ldquo;Personal&rdquo;. You can add
            more later.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Space name" error={errors.spaceName?.message} {...register('spaceName')} />
          <SelectField label="Currency" error={errors.currencyCode?.message} {...register('currencyCode')}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code} — {c.name}
              </option>
            ))}
          </SelectField>
        </div>

        <Button type="submit" loading={isSubmitting}>
          Create organization
        </Button>
      </form>
    </AuthLayout>
  )
}
