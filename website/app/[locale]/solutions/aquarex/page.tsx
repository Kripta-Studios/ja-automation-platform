import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { Droplets, Activity, ShieldCheck, Settings } from 'lucide-react';

export async function generateMetadata() {
  return {
    title: 'Aquarex | Intelligent Water Treatment Automation',
    description:
      "Aquarex is J&A Automation's standardized solution for industrial water treatment and RO systems.",
  };
}

export default async function AquarexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('aquarexTeaser');

  return (
    <div className="pt-20">
      {/* ═══ HERO ═══ */}
      <section className="section-padding bg-ja-charcoal text-white relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none"
          aria-hidden="true"
        >
          {/* Abstract Water Flow SVG */}
          <svg
            viewBox="0 0 800 800"
            className="w-full h-full text-ja-red"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M-100,400 Q100,300 300,400 T700,400 T1100,400" className="animate-pulse" />
            <path
              d="M-100,500 Q100,400 300,500 T700,500 T1100,500"
              className="animate-pulse"
              style={{ animationDelay: '1s' }}
            />
            <path
              d="M-100,600 Q100,500 300,600 T700,600 T1100,600"
              className="animate-pulse"
              style={{ animationDelay: '2s' }}
            />
          </svg>
        </div>
        <div className="container-ja relative z-10">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <Droplets className="text-ja-red" size={32} />
              <p className="eyebrow text-white/70 !mb-0">Proprietary Solution</p>
            </div>
            <h1 className="heading-display mb-6">Aquarex</h1>
            <p className="text-xl lg:text-2xl text-white/90 mb-8 font-light">
              Intelligent Control System for Industrial Water Treatment & Reverse Osmosis.
            </p>
            <p className="text-body text-ja-steel-300 mb-10 max-w-2xl leading-relaxed">
              {t('body')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#datasheet" className="btn btn-primary">
                Request Technical Datasheet
              </a>
              <Link href="/contact?intent=project" className="btn btn-secondary-dark">
                Talk to an Engineer
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <div className="text-center mb-16">
            <h2 className="heading-2">System Advantages</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="card text-center items-center">
              <div className="w-12 h-12 rounded-full bg-ja-red/10 flex items-center justify-center text-ja-red mb-6">
                <Activity size={24} />
              </div>
              <h3 className="text-lg font-semibold mb-3">Real-time Monitoring</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">
                Continuous data acquisition for conductivity, pH, flow rates, and pressure across
                all treatment stages.
              </p>
            </div>
            <div className="card text-center items-center">
              <div className="w-12 h-12 rounded-full bg-ja-red/10 flex items-center justify-center text-ja-red mb-6">
                <Settings size={24} />
              </div>
              <h3 className="text-lg font-semibold mb-3">Standardized Architecture</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">
                Pre-engineered PLC/HMI codebase reduces commissioning time by up to 40% while
                ensuring rock-solid reliability.
              </p>
            </div>
            <div className="card text-center items-center">
              <div className="w-12 h-12 rounded-full bg-ja-red/10 flex items-center justify-center text-ja-red mb-6">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-semibold mb-3">Compliance Ready</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">
                Built-in data logging and reporting tools designed to meet stringent food, beverage,
                and pharmaceutical regulations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ARCHITECTURE DIAGRAM ═══ */}
      <section className="section-padding bg-white border-t border-ja-line">
        <div className="container-ja">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="heading-2 mb-6">Standardized Process Control</h2>
              <p className="text-body text-ja-steel-700 mb-6 leading-relaxed">
                The Aquarex platform integrates seamlessly with Reverse Osmosis (RO) units,
                Ultrafiltration (UF), and chemical dosing systems. It provides a unified HMI
                interface for operators and standardizes data structures for easy ERP/MES
                integration.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3 text-sm text-ja-steel-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-ja-red mt-1.5 flex-shrink-0" />
                  <span>
                    <strong>Skid Integration:</strong> Plug-and-play logic blocks for common OEM
                    skids.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-ja-steel-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-ja-red mt-1.5 flex-shrink-0" />
                  <span>
                    <strong>Chemical Dosing:</strong> Precise closed-loop control of dosing pumps
                    based on in-line sensor feedback.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-ja-steel-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-ja-red mt-1.5 flex-shrink-0" />
                  <span>
                    <strong>Alarm Management:</strong> ISA 18.2 compliant alarm structures for rapid
                    troubleshooting.
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-ja-surface rounded-xl p-8 border border-ja-line flex items-center justify-center">
              {/* Technical SVG Diagram */}
              <svg
                viewBox="0 0 500 400"
                className="w-full max-w-md"
                aria-label="Aquarex Architecture Diagram"
              >
                <defs>
                  <marker
                    id="arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#11151A" />
                  </marker>
                </defs>

                {/* PLC Core */}
                <rect
                  x="150"
                  y="150"
                  width="200"
                  height="100"
                  rx="8"
                  fill="#FFFFFF"
                  stroke="#11151A"
                  strokeWidth="2"
                />
                <text
                  x="250"
                  y="200"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-[family-name:var(--font-manrope)] font-bold text-sm"
                  fill="#11151A"
                >
                  AQUAREX CORE PLC
                </text>

                {/* HMI */}
                <rect
                  x="175"
                  y="40"
                  width="150"
                  height="60"
                  rx="4"
                  fill="#FFFFFF"
                  stroke="#E31B23"
                  strokeWidth="2"
                />
                <text
                  x="250"
                  y="70"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-[family-name:var(--font-manrope)] font-bold text-xs"
                  fill="#E31B23"
                >
                  SCADA / HMI
                </text>
                <line
                  x1="250"
                  y1="100"
                  x2="250"
                  y2="150"
                  stroke="#11151A"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                  markerStart="url(#arrow)"
                />

                {/* Inputs */}
                <rect
                  x="20"
                  y="200"
                  width="100"
                  height="40"
                  rx="4"
                  fill="#F4F5F6"
                  stroke="#11151A"
                  strokeWidth="1"
                />
                <text
                  x="70"
                  y="220"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-[family-name:var(--font-ibm-plex-mono)] text-[10px]"
                  fill="#11151A"
                >
                  Sensors (pH, Cond)
                </text>
                <path
                  d="M 120 220 L 140 220 L 140 200 L 150 200"
                  fill="none"
                  stroke="#11151A"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />

                <rect
                  x="20"
                  y="250"
                  width="100"
                  height="40"
                  rx="4"
                  fill="#F4F5F6"
                  stroke="#11151A"
                  strokeWidth="1"
                />
                <text
                  x="70"
                  y="270"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-[family-name:var(--font-ibm-plex-mono)] text-[10px]"
                  fill="#11151A"
                >
                  Flow Meters
                </text>
                <path
                  d="M 120 270 L 140 270 L 140 225 L 150 225"
                  fill="none"
                  stroke="#11151A"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />

                {/* Outputs */}
                <rect
                  x="380"
                  y="160"
                  width="100"
                  height="40"
                  rx="4"
                  fill="#F4F5F6"
                  stroke="#11151A"
                  strokeWidth="1"
                />
                <text
                  x="430"
                  y="180"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-[family-name:var(--font-ibm-plex-mono)] text-[10px]"
                  fill="#11151A"
                >
                  Dosing Pumps
                </text>
                <line
                  x1="350"
                  y1="180"
                  x2="380"
                  y2="180"
                  stroke="#11151A"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />

                <rect
                  x="380"
                  y="210"
                  width="100"
                  height="40"
                  rx="4"
                  fill="#F4F5F6"
                  stroke="#11151A"
                  strokeWidth="1"
                />
                <text
                  x="430"
                  y="230"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-[family-name:var(--font-ibm-plex-mono)] text-[10px]"
                  fill="#11151A"
                >
                  VFDs / Motors
                </text>
                <line x1="350" y1="210" x2="370" y2="210" stroke="none" />
                <path
                  d="M 350 210 L 365 210 L 365 230 L 380 230"
                  fill="none"
                  stroke="#11151A"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />

                <rect
                  x="380"
                  y="260"
                  width="100"
                  height="40"
                  rx="4"
                  fill="#F4F5F6"
                  stroke="#11151A"
                  strokeWidth="1"
                />
                <text
                  x="430"
                  y="280"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-[family-name:var(--font-ibm-plex-mono)] text-[10px]"
                  fill="#11151A"
                >
                  Valves
                </text>
                <path
                  d="M 350 230 L 365 230 L 365 280 L 380 280"
                  fill="none"
                  stroke="#11151A"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DATASHEET REQUEST FORM ═══ */}
      <section id="datasheet" className="section-padding bg-ja-graphite">
        <div className="container-ja">
          <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 lg:p-12 shadow-xl">
            <div className="text-center mb-8">
              <h2 className="heading-2 mb-2">Request Technical Datasheet</h2>
              <p className="text-sm text-ja-steel-500">
                Enter your details to receive the complete Aquarex specification guide, IO list, and
                integration requirements.
              </p>
            </div>

            <form className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="firstName"
                    className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                  >
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="lastName"
                    className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                  >
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                >
                  Work Email *
                </label>
                <input
                  type="email"
                  id="email"
                  className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="company"
                  className="block text-xs font-semibold text-ja-ink uppercase tracking-wider mb-2"
                >
                  Company
                </label>
                <input
                  type="text"
                  id="company"
                  className="w-full px-4 py-3 rounded-lg border border-ja-line bg-ja-surface focus:outline-none focus:ring-2 focus:ring-ja-red/20 focus:border-ja-red transition-all"
                />
              </div>

              <button type="submit" className="btn btn-primary w-full mt-4">
                Send Datasheet
              </button>

              <p className="text-[11px] text-ja-steel-500 text-center mt-4">
                By requesting this datasheet, you agree to our privacy policy. We will never share
                your information.
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
