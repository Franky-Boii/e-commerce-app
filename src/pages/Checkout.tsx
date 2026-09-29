import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabaseClient'

interface PayfastCheckout {
  order_id: string
  action_url: string
  fields: Record<string, string>
}

interface Address {
  id: string
  line1: string
  line2: string | null
  city: string
  province: string | null
  postal_code: string
  country: string
  is_default: boolean
}

export default function Checkout() {
  const { items } = useCart()
  const { session } = useAuth()
  const navigate = useNavigate()

  const formRef = useRef<HTMLFormElement>(null)

  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState('')

  const [showAddressForm, setShowAddressForm] = useState(false)

  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('South Africa')
  const [isDefault, setIsDefault] = useState(false)

  const [checkout, setCheckout] =
    useState<PayfastCheckout | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)

  const [loadingAddresses, setLoadingAddresses] = useState(true)

  useEffect(() => {
    if (!session) {
      navigate('/login')
    }
  }, [session, navigate])

  // ----------------------------------------------------------
  // Load saved addresses
  // ----------------------------------------------------------

  useEffect(() => {
    if (!session) return

    async function loadAddresses() {
      setLoadingAddresses(true)
      setError(null)

      const { data, error: addressError } = await supabase
        .from('addresses')
        .select(
          'id, line1, line2, city, province, postal_code, country, is_default',
        )
        .order('is_default', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        })

      if (addressError) {
        setError(addressError.message)
      } else {
        setAddresses(data ?? [])

        const defaultAddress = data?.find(
          (address) => address.is_default,
        )

        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id)
        } else if (data?.length) {
          setSelectedAddressId(data[0].id)
        }
      }

      setLoadingAddresses(false)
    }

    loadAddresses()
  }, [session])

  // ----------------------------------------------------------
  // Add a new address
  // ----------------------------------------------------------

  async function saveAddress() {
    setError(null)

    if (!line1.trim()) {
      setError('Address line 1 is required')
      return
    }

    if (!city.trim()) {
      setError('City is required')
      return
    }

    if (!postalCode.trim()) {
      setError('Postal code is required')
      return
    }

    if (!country.trim()) {
      setError('Country is required')
      return
    }

    if (!session?.user.id) {
      setError('You must be logged in')
      return
    }

    const { data, error: insertError } = await supabase
      .from('addresses')
      .insert({
        user_id: session.user.id,
        line1: line1.trim(),
        line2: line2.trim() || null,
        city: city.trim(),
        province: province.trim() || null,
        postal_code: postalCode.trim(),
        country: country.trim(),
        is_default: isDefault,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    // If this address is now the default, reload the addresses
    // so the UI reflects the current database state.
    const { data: refreshedAddresses } = await supabase
      .from('addresses')
      .select(
        'id, line1, line2, city, province, postal_code, country, is_default',
      )
      .order('is_default', {
        ascending: false,
      })
      .order('created_at', {
        ascending: false,
      })

    const updatedAddresses = refreshedAddresses ?? [
      data as Address,
    ]

    setAddresses(updatedAddresses)
    setSelectedAddressId(data.id)

    // Reset form
    setLine1('')
    setLine2('')
    setCity('')
    setProvince('')
    setPostalCode('')
    setCountry('South Africa')
    setIsDefault(false)
    setShowAddressForm(false)
  }

  // ----------------------------------------------------------
  // Start checkout
  // ----------------------------------------------------------

  async function startCheckout() {
    if (!selectedAddressId) {
      setError('Please select a shipping address')
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
        throw new Error('No response from create-order')
      }

      setCheckout(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start checkout',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ----------------------------------------------------------
  // Auto-submit PayFast form
  // ----------------------------------------------------------

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
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-gray-500">
          Loading your shipping addresses…
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6 text-center">
        Checkout
      </h1>

      {error && (
        <div className="mb-4 rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!checkout && (
        <>
          {/* ------------------------------------------------ */}
          {/* Shipping address                                 */}
          {/* ------------------------------------------------ */}

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                Shipping address
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowAddressForm(!showAddressForm)
                }
                className="text-sm underline"
              >
                {showAddressForm
                  ? 'Cancel'
                  : '+ Add address'}
              </button>
            </div>

            {/* Saved addresses */}
            {!showAddressForm && (
              <>
                {!addresses.length ? (
                  <div className="rounded border p-4 text-sm text-gray-500">
                    You don't have a saved shipping address yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`block rounded border p-4 cursor-pointer ${
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
                            onChange={(event) =>
                              setSelectedAddressId(
                                event.target.value,
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
                              {address.postal_code}
                            </p>

                            <p>{address.country}</p>

                            {address.is_default && (
                              <span className="inline-block mt-1 text-xs font-medium">
                                Default address
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* New address form */}
            {showAddressForm && (
              <div className="border rounded p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Address line 1
                  </label>

                  <input
                    value={line1}
                    onChange={(e) =>
                      setLine1(e.target.value)
                    }
                    placeholder="123 Main Street"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Address line 2
                  </label>

                  <input
                    value={line2}
                    onChange={(e) =>
                      setLine2(e.target.value)
                    }
                    placeholder="Apartment / Unit / Complex"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    City
                  </label>

                  <input
                    value={city}
                    onChange={(e) =>
                      setCity(e.target.value)
                    }
                    placeholder="Cape Town"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Province
                  </label>

                  <input
                    value={province}
                    onChange={(e) =>
                      setProvince(e.target.value)
                    }
                    placeholder="Western Cape"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Postal code
                  </label>

                  <input
                    value={postalCode}
                    onChange={(e) =>
                      setPostalCode(e.target.value)
                    }
                    placeholder="8001"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Country
                  </label>

                  <input
                    value={country}
                    onChange={(e) =>
                      setCountry(e.target.value)
                    }
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) =>
                      setIsDefault(e.target.checked)
                    }
                  />

                  Make this my default address
                </label>

                <button
                  type="button"
                  onClick={saveAddress}
                  className="w-full bg-gray-800 text-white rounded px-4 py-2"
                >
                  Save address
                </button>
              </div>
            )}
          </div>

          {/* ------------------------------------------------ */}
          {/* Payment                                           */}
          {/* ------------------------------------------------ */}

          <button
            onClick={startCheckout}
            disabled={
              submitting ||
              !selectedAddressId ||
              showAddressForm
            }
            className="w-full bg-black text-white rounded px-6 py-3 disabled:opacity-50"
          >
            {submitting
              ? 'Preparing payment…'
              : 'Pay with PayFast'}
          </button>

          {showAddressForm && (
            <p className="text-xs text-gray-500 text-center mt-2">
              Save your address before continuing to payment.
            </p>
          )}
        </>
      )}

      {checkout && (
        <>
          <p className="text-sm text-gray-600 mb-4 text-center">
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
        </>
      )}
    </div>
  )
}