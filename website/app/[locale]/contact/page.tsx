'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ExternalLink, Mail, Phone } from 'lucide-react';
import { contact } from '@/content/company';
import { services } from '@/content/services';

type Intent = 'project' | 'support' | 'career';

function ContactFormContent() {
  const searchParams = useSearchParams();
  const t = useTranslations('contact');
  const [intent, setIntent] = useState<Intent>('project');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const intentParam = searchParams.get('intent');
    if (intentParam === 'support' || intentParam === 'project' || intentParam === 'career') {
      setIntent(intentParam as Intent);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    const form = new FormData(e.currentTarget);
    const name = [form.get('firstName'), form.get('lastName')]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .trim();
    const common = {
      name,
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      website: String(form.get('website') ?? ''),
    };

    const endpoint =
      intent === 'project'
        ? '/j-aautomation/api/public/inquiry'
        : intent === 'support'
          ? '/j-aautomation/api/public/support'
          : '/j-aautomation/api/public/career-interest';
    const payload =
      intent === 'project'
        ? {
            ...common,
            company: String(form.get('company') ?? ''),
            site: String(form.get('site') ?? ''),
            industry: String(form.get('industry') ?? ''),
            projectType: String(form.get('projectType') ?? ''),
            platform: String(form.get('platform') ?? ''),
            preferredContact: String(form.get('preferredContact') ?? 'email'),
            message: String(form.get('message') ?? ''),
          }
        : intent === 'support'
          ? {
              ...common,
              company: String(form.get('company') ?? ''),
              site: String(form.get('site') ?? ''),
              platform: String(form.get('platform') ?? ''),
              urgency: String(form.get('urgency') ?? 'planned'),
              message: String(form.get('message') ?? ''),
            }
          : {
              name,
              email: String(form.get('email') ?? ''),
              location: String(form.get('location') ?? ''),
              profile: String(form.get('profile') ?? ''),
              platforms: String(form.get('platforms') ?? ''),
              travel: String(form.get('travel') ?? 'limited'),
              message: String(form.get('message') ?? ''),
              website: String(form.get('website') ?? ''),
            };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t('errorBody'));
      }
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('errorBody'));
    }
  };

  if (status === 'success') {
    return (
      <div className="pt-20 min-h-[70vh] flex items-center justify-center bg-ja-surface">
        <div className="container-ja text-center max-w-lg">
          <div className="w-20 h-20 rounded-full bg-ja-success/10 text-ja-success flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="heading-display text-3xl mb-4">{t('requestQueuedHeading')}</h1>
          <p className="text-body text-ja-steel-700 mb-8">{t('requestQueuedBody')}</p>
          <button onClick={() => setStatus('idle')} className="btn btn-secondary">
            {t('sendAnother')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 bg-ja-surface min-h-screen">
      <div className="container-ja py-12 lg:py-20">
        <div className="max-w-3xl mx-auto mb-12 text-center">
          <h1 className="heading-display mb-4">{t('getInTouch')}</h1>
          <p className="text-lead text-ja-steel-700">{t('lead')}</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-12 max-w-6xl mx-auto">
          {/* Main Form Area */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-ja-line p-6 md:p-10">
            {/* Intent Selector */}
            <div className="flex flex-wrap gap-3 mb-8 pb-8 border-b border-ja-line">
              <button
                type="button"
                onClick={() => setIntent('project')}
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                  intent === 'project'
                    ? 'bg-ja-ink text-white shadow-md'
                    : 'bg-ja-surface text-ja-steel-700 hover:bg-ja-line'
                }`}
              >
                {t('projectInquiry')}
              </button>
              <button
                type="button"
                onClick={() => setIntent('support')}
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                  intent === 'support'
                    ? 'bg-ja-ink text-white shadow-md'
                    : 'bg-ja-surface text-ja-steel-700 hover:bg-ja-line'
                }`}
              >
                {t('technicalSupport')}
              </button>
              <button
                type="button"
                onClick={() => setIntent('career')}
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                  intent === 'career'
                    ? 'bg-ja-ink text-white shadow-md'
                    : 'bg-ja-surface text-ja-steel-700 hover:bg-ja-line'
                }`}
              >
                {t('careersTab')}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate={false}>
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="firstName"
                    className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                  >
                    {t('firstName')} *
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                    required
                    disabled={status === 'loading'}
                  />
                </div>
                <div>
                  <label
                    htmlFor="lastName"
                    className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                  >
                    {t('lastName')} *
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                    required
                    disabled={status === 'loading'}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                  >
                    {t('workEmail')} *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                    required
                    disabled={status === 'loading'}
                  />
                </div>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                  >
                    {t('phoneNumber')}
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                    disabled={status === 'loading'}
                  />
                </div>
              </div>

              {intent === 'project' && (
                <>
                  <div>
                    <label
                      htmlFor="company"
                      className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                    >
                      Company *
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                      required
                      disabled={status === 'loading'}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="site"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Country / Site *
                      </label>
                      <input
                        type="text"
                        id="site"
                        name="site"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="industry"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Industry *
                      </label>
                      <select
                        id="industry"
                        name="industry"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        defaultValue=""
                        required
                        disabled={status === 'loading'}
                      >
                        <option value="" disabled>
                          {t('selectIndustry')}
                        </option>
                        <option value="automotive">Automotive</option>
                        <option value="food_beverage">Food and beverage</option>
                        <option value="energy_process">Energy and process</option>
                        <option value="general_manufacturing">General manufacturing</option>
                        <option value="other">Other / not sure</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="projectType"
                      className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                    >
                      Primary Service of Interest
                    </label>
                    <select
                      id="projectType"
                      name="projectType"
                      className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all appearance-none"
                      defaultValue={searchParams.get('service') ?? ''}
                      required
                      disabled={status === 'loading'}
                    >
                      <option value="" disabled>
                        {t('selectService')}
                      </option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.slug.replace(/-/g, ' ')}
                        </option>
                      ))}
                      <option value="aquarex">Aquarex Water Treatment</option>
                      <option value="other">Other / Not Sure</option>
                    </select>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="platform"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Technology / Platform
                      </label>
                      <input
                        type="text"
                        id="platform"
                        name="platform"
                        placeholder="PLC, robot, SCADA, controls..."
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        disabled={status === 'loading'}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="preferredContact"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        {t('preferredContact')} *
                      </label>
                      <select
                        id="preferredContact"
                        name="preferredContact"
                        defaultValue="email"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      >
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {intent === 'support' && (
                <>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="company"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Company *
                      </label>
                      <input
                        type="text"
                        id="company"
                        name="company"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="site"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Site / Facility *
                      </label>
                      <input
                        type="text"
                        id="site"
                        name="site"
                        placeholder="Plant, site or system location"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="platform"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Affected System / Platform *
                      </label>
                      <input
                        type="text"
                        id="platform"
                        name="platform"
                        placeholder="PLC, robot, HMI, SCADA..."
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="urgency"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Urgency *
                      </label>
                      <select
                        id="urgency"
                        name="urgency"
                        defaultValue="planned"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      >
                        <option value="production_stopped">Production stopped</option>
                        <option value="degraded">Degraded</option>
                        <option value="planned">Planned support</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {intent === 'career' && (
                <>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="location"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Location *
                      </label>
                      <input
                        type="text"
                        id="location"
                        name="location"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="profile"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Professional Profile *
                      </label>
                      <input
                        type="text"
                        id="profile"
                        name="profile"
                        placeholder="Controls, robotics, electrical..."
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="platforms"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Platforms / Experience *
                      </label>
                      <input
                        type="text"
                        id="platforms"
                        name="platforms"
                        placeholder="PLC, robot, HMI or other experience"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="travel"
                        className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                      >
                        Travel Availability *
                      </label>
                      <select
                        id="travel"
                        name="travel"
                        defaultValue="limited"
                        className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                        required
                        disabled={status === 'loading'}
                      >
                        <option value="yes">Yes</option>
                        <option value="limited">Limited</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label
                  htmlFor="message"
                  className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                >
                  {intent === 'project'
                    ? `${t('projectDetails')} *`
                    : intent === 'support'
                      ? `${t('issueDescription')} *`
                      : `${t('aboutYourself')} *`}
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all resize-none"
                  required
                  disabled={status === 'loading'}
                />
              </div>

              {status === 'error' && (
                <p className="text-sm text-ja-red" role="alert">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                className={`btn btn-primary w-full md:w-auto min-w-[200px] ${status === 'loading' ? 'opacity-70 cursor-not-allowed' : ''}`}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? t('sending') : t('submitMessage')}
              </button>
            </form>
          </div>

          {/* Contact Info Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-ja-line p-6 md:p-8">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Phone size={20} className="text-ja-red" />
                {t('directContact')}
              </h3>
              <p className="font-semibold text-ja-ink">{contact.primaryName}</p>
              <p className="mb-6 text-sm text-ja-steel-500">{contact.primaryTitle}</p>
              <a
                href={`tel:${contact.usPhone.replace(/[^\d+]/g, '')}`}
                className="flex items-center gap-2 text-sm text-ja-steel-700 hover:text-ja-red transition-colors"
              >
                <Phone size={16} /> {contact.usPhone}
              </a>
              <a
                href={contact.linkedinUrl}
                className="mt-4 flex items-center gap-2 text-sm text-ja-steel-700 hover:text-ja-red transition-colors"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} /> {t('linkedin')}
              </a>
            </div>

            <div className="bg-ja-graphite text-white rounded-xl shadow-sm p-6 md:p-8">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Mail size={20} className="text-ja-red" />
                {t('generalInquiries')}
              </h3>
              <a
                href={`mailto:${contact.email}`}
                className="text-sm text-ja-steel-300 hover:text-white transition-colors"
              >
                {contact.email}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-20 min-h-screen bg-ja-surface flex items-center justify-center">
          <p>Loading…</p>
        </div>
      }
    >
      <ContactFormContent />
    </Suspense>
  );
}
