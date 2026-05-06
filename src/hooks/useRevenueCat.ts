import { useEffect, useState } from 'react'
import Purchases, { type CustomerInfo } from 'react-native-purchases'
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui'

const PRO_ENTITLEMENT = 'pro'

const useRevenueCat = () => {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Purchases.getCustomerInfo()
      .then((info) => { setCustomerInfo(info); setIsLoading(false) })
      .catch(() => setIsLoading(false))

    Purchases.addCustomerInfoUpdateListener(setCustomerInfo)
    return () => Purchases.removeCustomerInfoUpdateListener(setCustomerInfo)
  }, [])

  const isPro = customerInfo?.entitlements.active[PRO_ENTITLEMENT] !== undefined

  const presentPaywall = async (): Promise<boolean> => {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    })
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED
  }

  const restorePurchases = async () => {
    const info = await Purchases.restorePurchases()
    setCustomerInfo(info)
  }

  return { isPro, isLoading, customerInfo, presentPaywall, restorePurchases }
}

export { useRevenueCat }
