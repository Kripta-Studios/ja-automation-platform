import { base } from '$app/paths';
import type { ProblemData } from '$lib/problem/contract';
import { privateDownloadFilename, typedPrivateDownloadProblem } from './private-document-download';

export type ReportPdfMode = 'open' | 'download';

export type ReportPdfLabels = Readonly<{
  title: string;
  loading: string;
  download: string;
  previewFallback: string;
  language: string;
}>;

export type ReportPdfAttempt = Readonly<{
  result: Promise<ProblemData | null>;
  cancel: () => void;
}>;

const messageKeys: Readonly<Record<string, ProblemData['messageKey']>> = {
  REPORT_PDF_SIGN_IN_REQUIRED: 'problem.report.pdfSignInRequired',
  REPORT_PDF_UNAVAILABLE: 'problem.report.pdfUnavailable',
  REPORT_PDF_NOT_READY: 'problem.report.pdfNotReady',
  REPORT_PDF_INTEGRITY_BLOCKED: 'problem.report.pdfIntegrityBlocked',
  REPORT_PDF_SERVICE_UNAVAILABLE: 'problem.report.pdfServiceUnavailable',
};

const allowedRemedies = new Set([
  'sign_in_again',
  'review_report',
  'review_reports',
  'contact_owner',
  'retry_download',
]);

function fallback(kind: 'network' | 'invalid' | 'signIn' | 'popup', reference = ''): ProblemData {
  const definition = {
    network: ['REPORT_PDF_NETWORK_UNAVAILABLE', 'problem.report.pdfNetworkUnavailable', 'retry_download'],
    invalid: ['REPORT_PDF_INVALID_RESPONSE', 'problem.report.pdfInvalidResponse', 'review_report'],
    signIn: ['REPORT_PDF_SIGN_IN_REQUIRED', 'problem.report.pdfSignInRequired', 'sign_in_again'],
    popup: ['REPORT_PDF_POPUP_BLOCKED', 'problem.report.pdfPopupBlocked', 'retry_download'],
  } as const;
  const [code, messageKey, remedy] = definition[kind];
  return {
    code,
    messageKey,
    params: {},
    fieldErrors: {},
    remedies: [{ id: remedy }],
    correlationId: /^[A-Za-z0-9._:-]{8,96}$/u.test(reference) ? reference : '',
  };
}

function preparePopup(popup: Window, labels: ReportPdfLabels): boolean {
  try {
    popup.opener = null;
    const doc = popup.document;
    doc.title = labels.title;
    doc.documentElement.lang = labels.language;
    const body = doc.body;
    body.replaceChildren();
    body.style.cssText = 'font: 1rem/1.5 system-ui, sans-serif; margin: 1.5rem; color: #181716';
    const status = doc.createElement('p');
    status.textContent = labels.loading;
    const guidance = doc.createElement('p');
    guidance.textContent = labels.previewFallback;
    body.append(status, guidance);
    return true;
  } catch {
    popup.close();
    return false;
  }
}

function showPopup(popup: Window, url: string, filename: string, labels: ReportPdfLabels): boolean {
  try {
    const doc = popup.document;
    const body = doc.body;
    body.querySelector('p')?.remove();
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    link.textContent = labels.download;
    link.style.cssText = 'display: inline-block; margin: .5rem 0 1rem; min-height: 2.75rem; color: #0645ad';
    const frame = doc.createElement('iframe');
    frame.title = labels.title;
    frame.style.cssText = 'display: block; width: 100%; height: 78vh; border: 1px solid #d6d5d2';
    body.append(link, frame);
    frame.src = url;
    return true;
  } catch {
    popup.close();
    return false;
  }
}

/** Start from a user gesture so a browser can reserve a preview tab before the GET. */
export function beginReportPdfDownload(
  id: string,
  mode: ReportPdfMode,
  labels: ReportPdfLabels,
): ReportPdfAttempt {
  const controller = new AbortController();
  let pendingPopup: Window | null = null;
  let popupBlocked = false;
  if (mode === 'open') {
    try {
      pendingPopup = window.open('about:blank', '_blank');
      if (pendingPopup && !preparePopup(pendingPopup, labels)) pendingPopup = null;
    } catch {
      pendingPopup = null;
    }
    popupBlocked = !pendingPopup;
  }
  const cancel = (): void => {
    controller.abort();
    pendingPopup?.close();
    pendingPopup = null;
  };
  const result = (async (): Promise<ProblemData | null> => {
    if (popupBlocked) return fallback('popup');
    try {
      const response = await fetch(`${base}/app/api/reports/${encodeURIComponent(id)}/pdf`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/pdf, application/json' },
      });
      if (controller.signal.aborted) return null;
      const reference = response.headers.get('x-correlation-id') ?? '';
      if (response.redirected) {
        const destination = new URL(response.url);
        pendingPopup?.close();
        return fallback(
          destination.origin === location.origin && destination.pathname.endsWith('/app/login')
            ? 'signIn'
            : 'invalid',
          reference,
        );
      }
      if (!response.ok) {
        const payload = response.headers.get('content-type')?.toLowerCase().includes('application/json')
          ? await response.json().catch(() => null)
          : null;
        if (controller.signal.aborted) return null;
        pendingPopup?.close();
        return typedPrivateDownloadProblem(payload, messageKeys, allowedRemedies, reference) ??
          fallback(response.status === 401 ? 'signIn' : 'invalid', reference);
      }
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const disposition = response.headers.get('content-disposition');
      if (type !== 'application/pdf' || !disposition?.toLowerCase().startsWith('attachment')) {
        pendingPopup?.close();
        return fallback('invalid', reference);
      }
      const file = await response.blob();
      if (controller.signal.aborted) return null;
      const length = response.headers.get('content-length');
      if (file.size < 8 || (length && Number(length) !== file.size) || await file.slice(0, 5).text() !== '%PDF-') {
        pendingPopup?.close();
        return fallback('invalid', reference);
      }
      if (controller.signal.aborted) return null;
      const url = URL.createObjectURL(file);
      const filename = privateDownloadFilename(disposition, `report-${id}.pdf`);
      const releaseUrl = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      };
      const timer = window.setTimeout(releaseUrl, mode === 'open' ? 3_600_000 : 60_000);
      if (mode === 'open') {
        if (!pendingPopup || !showPopup(pendingPopup, url, filename, labels)) {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          return fallback('popup');
        }
        pendingPopup.addEventListener('pagehide', releaseUrl, { once: true });
        pendingPopup = null;
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
      }
      return null;
    } catch {
      pendingPopup?.close();
      return controller.signal.aborted ? null : fallback('network');
    } finally {
      pendingPopup = null;
    }
  })();
  return { result, cancel };
}
