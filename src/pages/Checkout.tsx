import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { Address } from '@/types'

interface PayfastCheckout {
  order_id: string
  action_url: string
  fields: Record<string, string>
}

interface AddressForm {
  line1: string
  line2: string
  city: string
  province: string
  postal_code: string
  country: string
}

const emptyAddressForm: AddressForm = {
  line1: '',
  line2: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'South Africa',
}

export default function Checkout() {
  const { items, subtotal } = useCart()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [addressForm, setAddressForm] =
    useState<AddressForm>(emptyAddressForm)

  const [showAddressForm, setShowAddressForm] = useState(false)
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [savingAddress, setSavingAddress] = useState(false)

  const [checkout, setCheckout] =
    useState<PayfastCheckout | null>(null)

  const formRef = useRef<HTMLFormElement>(null)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const deliveryFee = subtotal >= 1000 ? 0 : 60
  const estimatedTotal = subtotal + deliveryFee

  useEffect(() => {
    if (!session) {
      navigate('/login')
      return
    }

    async function loadAddresses() {
      setLoadingAddresses(true)
      setError(null)

      const { data, error: addressError } = await supabase
        .from('addresses')
        .select('*')
        .order('is_default', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        })

      if (addressError) {
        setError('Could not load your shipping addresses.')
      } else {
        const loaded = (data ?? []) as Address[]

        setAddresses(loaded)

        const defaultAddress =
          loaded.find((address) => address.is_default) ??
          loaded[0]

        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id)
        }
      }

      setLoadingAddresses(false)
    }

    loadAddresses()
  }, [session, navigate])

  async function saveAddress(event: FormEvent) {
    event.preventDefault()

    if (!session?.user) {
      setError('You must be signed in.')
      return
    }

    setSavingAddress(true)
    setError(null)

    try {
      if (
        !addressForm.line1.trim() ||
        !addressForm.city.trim() ||
        !addressForm.postal_code.trim() ||
        !addressForm.country.trim()
      ) {
        throw new Error(
          'Please complete all required address fields.',
        )
      }

      const shouldBeDefault = addresses.length === 0

      const { data, error: insertError } = await supabase
        .from('addresses')
        .insert({
          user_id: session.user.id,
          line1: addressForm.line1.trim(),
          line2: addressForm.line2.trim() || null,
          city: addressForm.city.trim(),
          province: addressForm.province.trim() || null,
          postal_code: addressForm.postal_code.trim(),
          country: addressForm.country.trim(),
          is_default: shouldBeDefault,
        })
        .select()
        .single()

      if (insertError) {
        throw insertError
      }

      const newAddress = data as Address

      setAddresses((current) => [
        newAddress,
        ...current,
      ])

      setSelectedAddressId(newAddress.id)
      setAddressForm(emptyAddressForm)
      setShowAddressForm(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save address.',
      )
    } finally {
      setSavingAddress(false)
    }
  }

  async function startCheckout() {
    if (!selectedAddressId) {
      setError('Please select a shipping address.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { data, error: fnError } =
        await supabase.functions.invoke<PayfastCheckout>(
          'create-order',
          {
            body: {
              address_id: selectedAddressId,
            },
          },
        )

      if (fnError) {
        throw fnError
      }

      if (!data) {
        throw new Error(
          'No response from create-order',
        )
      }

      setCheckout(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start checkout.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Automatically submit the PayFast form once the
  // Edge Function has returned the payment fields.
  useEffect(() => {
    if (checkout && formRef.current) {
      formRef.current.submit()
    }
  }, [checkout])

  if (!items.length) {
    return (
      <div className="p-8 text-center text-gray-500">
        Your cart is empty.
      </div>
    )
  }

  if (loadingAddresses) {
    return (
      <div className="p-8 text-center">
        Loading checkout…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">
        Checkout
      </h1>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!checkout && (
        <>
          <section className="border rounded-lg p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Shipping address
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowAddressForm((current) => !current)
                }
                className="text-sm underline"
              >
                {showAddressForm
                  ? 'Cancel'
                  : 'Add new address'}
              </button>
            </div>

            {addresses.length === 0 &&
              !showAddressForm && (
                <p className="text-sm text-gray-500">
                  You don't have a saved address yet.
                  Add one to continue.
                </p>
              )}

            {addresses.length > 0 && (
              <div className="space-y-3">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={`block border rounded-lg p-4 cursor-pointer ${
                      selectedAddressId === address.id
                        ? 'border-black'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex gap-3">
                      <input
                        type="radio"
                        name="shipping-address"
                        value={address.id}
                        checked={
                          selectedAddressId ===
                          address.id
                        }
                        onChange={() =>
                          setSelectedAddressId(
                            address.id,
                          )
                        }
                      />

                      <div className="text-sm">
                        <p className="font-medium">
                          {address.line1}
                        </p>

                        {address.line2 && (
                          <p>{address.line2}</p>
                        )}

                        <p>
                          {address.city}
                          {address.province
                            ? `, ${address.province}`
                            : ''}
                        </p>

                        <p>
                          {address.postal_code},{' '}
                          {address.country}
                        </p>

                        {address.is_default && (
                          <span className="inline-block mt-2 text-xs font-medium">
                            Default address
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {showAddressForm && (
              <form
                onSubmit={saveAddress}
                className="mt-5 border-t pt-5 space-y-4"
              >
                <h3 className="font-medium">
                  Add shipping address
                </h3>

                <div>
                  <label className="block text-sm mb-1">
                    Address line 1 *
                  </label>

                  <input
                    required
                    value={addressForm.line1}
                    onChange={(event) =>
                      setAddressForm({
                        ...addressForm,
                        line1: event.target.value,
                      })
                    }
                    className="w-full border rounded px-3 py-2"
                    placeholder="123 Main Street"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">
                    Address line 2
                  </label>

                  <input
                    value={addressForm.line2}
                    onChange={(event) =>
                      setAddressForm({
                        ...addressForm,
                        line2: event.target.value,
                      })
                    }
                    className="w-full border rounded px-3 py-2"
                    placeholder="Apartment, unit, etc."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">
                      City *
                    </label>

                    <input
                      required
                      value={addressForm.city}
                      onChange={(event) =>
                        setAddressForm({
                          ...addressForm,
                          city: event.target.value,
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="Cape Town"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1">
                      Province
                    </label>

                    <input
                      value={addressForm.province}
                      onChange={(event) =>
                        setAddressForm({
                          ...addressForm,
                          province: event.target.value,
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="Western Cape"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">
                      Postal code *
                    </label>

                    <input
                      required
                      value={addressForm.postal_code}
                      onChange={(event) =>
                        setAddressForm({
                          ...addressForm,
                          postal_code:
                            event.target.value,
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="8001"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1">
                      Country *
                    </label>

                    <input
                      required
                      value={addressForm.country}
                      onChange={(event) =>
                        setAddressForm({
                          ...addressForm,
                          country: event.target.value,
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingAddress}
                  className="bg-black text-white rounded px-5 py-2 disabled:opacity-50"
                >
                  {savingAddress
                    ? 'Saving…'
                    : 'Save address'}
                </button>
              </form>
            )}
          </section>

          <section className="border rounded-lg p-5 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              Order summary
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>

                <span>
                  R{subtotal.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Delivery</span>

                <span>
                  {deliveryFee === 0
                    ? 'FREE'
                    : `R${deliveryFee.toFixed(2)}`}
                </span>
              </div>

              <div className="border-t pt-3 mt-3 flex justify-between text-base font-semibold">
                <span>Total</span>

                <span>
                  R{estimatedTotal.toFixed(2)}
                </span>
              </div>

              <p className="text-xs text-gray-500 pt-2">
                Final price and stock are verified
                server-side before the order is created.
              </p>
            </div>
          </section>

          <button
            onClick={startCheckout}
            disabled={
              submitting || !selectedAddressId
            }
            className="w-full bg-black text-white rounded px-6 py-3 disabled:opacity-50"
          >
            {submitting
              ? 'Preparing payment…'
              : 'Pay with PayFast'}
          </button>
        </>
      )}

      {checkout && (
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-4">
            Redirecting you to PayFast…
          </p>

          <form
            ref={formRef}
            action={checkout.action_url}
            method="POST"
          >
            {Object.entries(checkout.fields).map(
              ([key, value]) => (
                <input
                  key={key}
                  type="hidden"
                  name={key}
                  value={value}
                />
              ),
            )}
          </form>
        </div>
      )}
    </div>
  )
}