import { useEffect, useState } from 'react';
import Purchases, { type CustomerInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useSessionStore } from '@/src/stores';

const PRO_ENTITLEMENT = 'pro';

const useRevenueCat = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Purchases.getCustomerInfo()
      .then((info) => {
        setCustomerInfo(info);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));

    Purchases.addCustomerInfoUpdateListener(setCustomerInfo);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(setCustomerInfo);
    };
  }, []);

  // Pro is account-scoped in this app ("Sign in for Pro"), but RevenueCat ties
  // subscriptions to the device's store account — so after signing out, the
  // anonymous RC user can still report the active store sub (or a stale prior
  // customerInfo). Treat anonymous as never-Pro so the UI/limit stay consistent.
  const isPro = !isAnonymous && customerInfo?.entitlements.active[PRO_ENTITLEMENT] !== undefined;

  const presentPaywall = async (): Promise<boolean> => {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    });
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  };

  const restorePurchases = async () => {
    const info = await Purchases.restorePurchases();
    setCustomerInfo(info);
  };

  return { isPro, isLoading, customerInfo, presentPaywall, restorePurchases };
};

export { useRevenueCat };
