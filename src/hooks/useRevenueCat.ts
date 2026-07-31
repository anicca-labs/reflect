import { useEffect, useState } from 'react';
import Purchases, { type CustomerInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useAppLockStore, useSessionStore } from '@/src/stores';
import { supabase } from '@/src/services/supabase';

const PRO_ENTITLEMENT = 'pro';

// Where a paywall presentation was triggered from — recorded in api.paywall_views
// so we can measure reach and identify viewers who never purchased.
type PaywallSource =
  | 'entry-limit'
  | 'reflection-limit'
  | 'settings'
  | 'merge'
  | 'pro-intent'
  | 'export'
  | 'unknown';

// Fire-and-forget: instrumentation must never delay or fail the paywall.
const logPaywallView = (source: PaywallSource) => {
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      const userId = session?.user?.id;
      if (!userId) return; // guests can't write (RLS) — known blind spot
      return supabase.from('paywall_views').insert({ user_id: userId, source });
    })
    .then(() => {})
    .catch(() => {});
};

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

  // The paywall and the StoreKit purchase sheet drive the app through
  // inactive/background. Flagging the store sheet keeps the biometric app-lock
  // from engaging on that churn — the user never actually left the app.
  const presentPaywall = async (source: PaywallSource = 'unknown'): Promise<boolean> => {
    logPaywallView(source);
    useAppLockStore.getState().openStoreSheet();
    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: PRO_ENTITLEMENT,
      });
      return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
    } finally {
      useAppLockStore.getState().closeStoreSheet();
    }
  };

  const restorePurchases = async () => {
    useAppLockStore.getState().openStoreSheet();
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
    } finally {
      useAppLockStore.getState().closeStoreSheet();
    }
  };

  return { isPro, isLoading, customerInfo, presentPaywall, restorePurchases };
};

export { useRevenueCat };
