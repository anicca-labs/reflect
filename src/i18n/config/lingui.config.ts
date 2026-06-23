import type { LinguiConfig } from '@lingui/conf';
import { formatter } from '@lingui/format-po';
import { defaultFallbackLocale, locales } from './constants';

const rootPath = 'src';

const linguiConfig: LinguiConfig = {
  locales: Object.keys(locales),
  fallbackLocales: {
    default: defaultFallbackLocale,
  },
  catalogs: [
    {
      path: `${rootPath}/i18n/locales/exported/{locale}/app`,
      include: ['app'],
    },
    {
      path: `${rootPath}/i18n/locales/exported/{locale}/screens`,
      include: [`${rootPath}/screens`],
    },
    {
      path: `${rootPath}/i18n/locales/exported/{locale}/components`,
      include: [`${rootPath}/components`],
    },
  ],
  catalogsMergePath: `${rootPath}/i18n/locales/compiled/{locale}`,
  format: formatter({ lineNumbers: false }),
  compileNamespace: 'ts',
};

export { linguiConfig };
