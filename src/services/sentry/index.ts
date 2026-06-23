import * as Sentry from '@sentry/react-native';

const setupSentry = (isEnabled: boolean) => {
  Sentry.init({
    dsn: isEnabled ? process.env.EXPO_PUBLIC_SENTRY_DSN : undefined,
    environment: process.env.EXPO_PUBLIC_ENV ?? 'stg',
    tracesSampleRate: 0.2,
    enabled: isEnabled,
    maxBreadcrumbs: 150,
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === 'console') return null;
      return breadcrumb;
    },
  });
};

export { setupSentry };
