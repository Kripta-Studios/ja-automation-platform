export {
  assertPortalCatalogParity,
  createTranslator,
  INVARIANT_TRANSLATION_KEYS,
  isExplicitCoverageTranslation,
  portalCatalog,
  portalCatalogKeys,
  portalLocales,
  portalSupplementalKeys,
  renderPortalMessage,
  translate,
  type DocumentLanguage,
  type PortalLocale,
  type PortalLocaleInput,
  type PortalTranslationKey,
  type TranslationParams,
} from './catalog';

export {
  createPortalLocaleController,
  documentLanguage,
  PORTAL_LOCALE_STORAGE_KEY,
  setDocumentLanguage,
} from './context';

export { normalizePortalLocale } from './catalog';

export {
  isReportHistoryAction,
  translateReportHistoryAction,
  type ReportHistoryAction,
  type ReportHistoryRecord,
} from './report-history';
