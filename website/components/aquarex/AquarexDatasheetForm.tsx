'use client';

import { useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { publicApiPath, publicBasePath } from '@/lib/portal';

type FormStatus = 'idle' | 'submitting' | 'error' | 'queued';

type AquarexDatasheetFormProps = Readonly<{
  locale: string;
}>;

const fieldClassName =
  'w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all disabled:opacity-60';

const createIdempotencyKey = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `aquarex-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function AquarexDatasheetForm({ locale }: AquarexDatasheetFormProps) {
  const page = useTranslations('aquarex');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const idempotencyKey = useRef<string | undefined>(undefined);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'submitting') return;

    const form = new FormData(event.currentTarget);
    const firstName = String(form.get('firstName') ?? '').trim();
    const lastName = String(form.get('lastName') ?? '').trim();
    const sourcePage = `${publicBasePath}/${locale}/solutions/aquarex`;
    const language = locale === 'es' || locale === 'pt' ? locale : 'en';

    setStatus('submitting');
    setErrorMessage('');

    const payload = {
      name: [firstName, lastName].filter(Boolean).join(' '),
      company: String(form.get('company') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      phone: '',
      site: String(form.get('site') ?? '').trim(),
      industry: 'Water treatment',
      projectType: 'Aquarex datasheet request',
      platform: 'Aquarex',
      preferredContact: 'email',
      message: `Aquarex datasheet request. Language: ${language}. Source page: ${sourcePage}.`,
      website: String(form.get('website') ?? ''),
    };

    const requestKey = idempotencyKey.current ?? createIdempotencyKey();
    idempotencyKey.current = requestKey;

    try {
      const response = await fetch(publicApiPath('api/public/aquarex'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': requestKey,
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { accepted?: boolean } | null;
      if (response.status === 409) idempotencyKey.current = undefined;
      if (!response.ok || body?.accepted !== true) throw new Error('Request was not accepted');
      setStatus('queued');
    } catch {
      setStatus('error');
      setErrorMessage(page('errorBody'));
    }
  };

  if (status === 'queued') {
    return (
      <div className="text-center" role="status" aria-live="polite">
        <div className="w-16 h-16 rounded-full bg-ja-success/10 text-ja-success flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={32} />
        </div>
        <h3 className="heading-3 text-2xl mb-3">{page('queuedHeading')}</h3>
        <p className="text-body text-ja-steel-700 mb-3">{page('queuedBody')}</p>
        <p className="text-sm text-ja-steel-500 mb-7">{page('queuedStatus')}</p>
        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setErrorMessage('');
            idempotencyKey.current = undefined;
          }}
          className="btn btn-secondary"
        >
          {page('sendAnother')}
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} aria-busy={status === 'submitting'}>
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="aquarex-website">{page('website')}</label>
        <input id="aquarex-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="aquarex-first-name"
            className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
          >
            {page('firstName')} *
          </label>
          <input
            type="text"
            id="aquarex-first-name"
            name="firstName"
            className={fieldClassName}
            autoComplete="given-name"
            required
            disabled={status === 'submitting'}
          />
        </div>
        <div>
          <label
            htmlFor="aquarex-last-name"
            className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
          >
            {page('lastName')} *
          </label>
          <input
            type="text"
            id="aquarex-last-name"
            name="lastName"
            className={fieldClassName}
            autoComplete="family-name"
            required
            disabled={status === 'submitting'}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="aquarex-email"
          className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
        >
          {page('workEmail')} *
        </label>
        <input
          type="email"
          id="aquarex-email"
          name="email"
          className={fieldClassName}
          autoComplete="email"
          required
          disabled={status === 'submitting'}
        />
      </div>

      <div>
        <label
          htmlFor="aquarex-company"
          className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
        >
          {page('company')} *
        </label>
        <input
          type="text"
          id="aquarex-company"
          name="company"
          className={fieldClassName}
          autoComplete="organization"
          required
          disabled={status === 'submitting'}
        />
      </div>

      <div>
        <label
          htmlFor="aquarex-site"
          className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
        >
          {page('site')} *
        </label>
        <input
          type="text"
          id="aquarex-site"
          name="site"
          className={fieldClassName}
          autoComplete="address-level2"
          required
          disabled={status === 'submitting'}
        />
      </div>

      {status === 'error' && (
        <div
          role="alert"
          className="rounded-lg border border-ja-red/30 bg-ja-red/5 px-4 py-3 text-sm text-ja-red"
        >
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full mt-4 disabled:cursor-wait disabled:opacity-60"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? page('submitting') : page('sendDatasheet')}
      </button>

      <p className="text-[11px] text-ja-steel-700 text-center mt-4">{page('privacyNote')}</p>
    </form>
  );
}
