import * as Sentry from '@sentry/react-native';

const setupSentry = (isEnabled: boolean) => {
  Sentry.init({
    dsn: isEnabled ? process.env.EXPO_PUBLIC_SENTRY_DSN : undefined,
    environment: process.env.EXPO_PUBLIC_ENV ?? 'stg',
    tracesSampleRate: 0.2,
    // Default is 2s, which flags normal cold starts on old low-memory devices as
    // errors (first report: a 2019 iPad mini with 55MB free RAM doing UIKit
    // first-layout — OS-internal stack, no app code). 4s still catches real
    // freezes a user would feel, without a report for every slow launch.
    appHangTimeoutInterval: 4,
    enabled: isEnabled,
    maxBreadcrumbs: 150,
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === 'console') return null;
      return breadcrumb;
    },
  });
};

export { setupSentry };
