<script lang="ts">
  import { base } from '$app/paths';
  import type { Locale } from '@ja/i18n';
  import Footer from './Footer.svelte';
  import Header from './Header.svelte';
  import Hero from './Hero.svelte';
  import InquiryForm from './InquiryForm.svelte';
  import ProjectArchive from './ProjectArchive.svelte';
  import { capabilities, copy, industries, projects } from './content';

  let { data }: { data: { locale: Locale; path: string } } = $props();
  let content = $derived(copy[data.locale]);
  let path = $derived(data.path.replace(/\/$/, ''));
  let segment = $derived(path.split('/')[0] ?? '');
  let slug = $derived(path.split('/')[1] ?? '');
  let title = $derived(
    path === ''
      ? content.hero.title
      : segment === 'solutions'
        ? content.aquarex.title
        : (content.nav[segment] ?? segment),
  );
  const origin = 'https://gex-dashboard.hopto.org';
  let canonical = $derived(`${origin}${base}/${data.locale}/${path ? `${path}/` : ''}`);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'J&A Automation',
    foundingDate: '2008',
    url: `${origin}${base}/en/`,
  });
  const asset = (value: string) => `${base}${value}`;
  const display = (value: string) =>
    value
      .split('-')
      .map((part) =>
        part === 'plc' || part === 'hmi' || part === 'scada' || part === 'oem'
          ? part.toUpperCase()
          : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`,
      )
      .join(' ');
</script>

<svelte:head>
  <title>{title} | J&A Automation</title>
  <meta
    name="description"
    content={path === ''
      ? content.hero.body
      : path === 'projects'
        ? content.projects.body
        : content.intro.body}
  />
  <link rel="canonical" href={canonical} />
  {#each ['en', 'pt', 'es'] as locale}<link
      rel="alternate"
      hreflang={locale === 'pt' ? 'pt-BR' : locale}
      href={`${origin}${base}/${locale}/${path ? `${path}/` : ''}`}
    />{/each}
  <link
    rel="alternate"
    hreflang="x-default"
    href={`${origin}${base}/en/${path ? `${path}/` : ''}`}
  />
  <meta property="og:title" content={`${title} | J&A Automation`} /><meta
    property="og:description"
    content={content.hero.body}
  /><meta property="og:type" content="website" /><meta property="og:url" content={canonical} />
  {@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>

<Header locale={data.locale} {content} />
<main id="main">
  {#if path === ''}
    <Hero {content} />
    <section class="proof">
      <div class="shell">
        {#each content.proof as item}<strong>{item}</strong>{/each}<span class="proof-line"></span>
      </div>
    </section>
    <section class="split-section shell intro-section">
      <div>
        <p class="eyebrow">01 / INDUSTRIAL ENGINEERING</p>
        <h2>{content.intro.title}</h2>
        <p class="lead">{content.intro.body}</p>
        <a class="text-link" href={`${base}/${data.locale}/about/`}>{content.nav.about} →</a>
      </div>
      <figure>
        <img
          src={asset('/images/industries/automotive-assembly.jpg')}
          alt="Industrial automotive assembly equipment"
          width="980"
          height="720"
          loading="lazy"
        />
        <figcaption class="mono">CONTROLS / INTEGRATION / COMMISSIONING</figcaption>
      </figure>
    </section>
    <section id="capabilities" class="dark-section section-pad">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow light">02 / ENGINEERING RANGE</p>
            <h2>{content.capabilities.title}</h2>
          </div>
          <p>{content.capabilities.body}</p>
        </div>
        <div class="cap-grid">
          {#each capabilities as item}<a href={`${base}/${data.locale}/capabilities/${item.slug}/`}
              ><span class="mono">{item.code}</span>
              <h3>{display(item.slug)}</h3>
              <span class="arrow">↗</span></a
            >{/each}
        </div>
      </div>
    </section>
    <section class="section-pad shell">
      <div class="section-head">
        <div>
          <p class="eyebrow">03 / OPERATING ENVIRONMENTS</p>
          <h2>{content.industries.title}</h2>
        </div>
        <p>{content.industries.body}</p>
      </div>
      <div class="industry-grid">
        {#each industries.slice(0, 4) as item}<a
            href={`${base}/${data.locale}/industries/${item.slug}/`}
            ><img src={asset(item.image)} alt="" width="700" height="520" loading="lazy" />
            <div>
              <span class="mono">{String(industries.indexOf(item) + 1).padStart(2, '0')}</span>
              <h3>{display(item.slug)}</h3>
            </div></a
          >{/each}
      </div>
    </section>
    <section class="project-feature section-pad">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow light">04 / ARCHIVE</p>
            <h2>{content.projects.title}</h2>
          </div>
          <p>{content.projects.body}</p>
        </div>
        <div class="featured-projects">
          {#each projects.slice(0, 3) as project}<article>
              <span class="mono">{project.year} / {project.region}</span>
              <h3>{project.title}</h3>
              <p>{project.scope}</p>
              <div>{project.client} · {project.technology}</div>
            </article>{/each}
        </div>
        <a class="button outline-light" href={`${base}/${data.locale}/projects/`}
          >View project archive →</a
        >
      </div>
    </section>
    <section class="process section-pad shell">
      <p class="eyebrow">05 / DELIVERY</p>
      <h2>Engineering that follows the project into production.</h2>
      <ol>
        {#each ['Understand', 'Engineer', 'Validate', 'Commission', 'Support'] as step, index}<li>
            <span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>
          </li>{/each}
      </ol>
    </section>
    <section class="support-band">
      <div class="shell">
        <div>
          <p class="eyebrow light">REMOTE + FIELD SUPPORT</p>
          <h2>Route a controls problem to an engineer.</h2>
        </div>
        <a class="button white" href={`${base}/${data.locale}/contact/?mode=support`}
          >{content.support} ↗</a
        >
      </div>
    </section>
    <section class="split-section shell aquarex-section">
      <div>
        <p class="eyebrow">06 / AQUAREX</p>
        <h2>{content.aquarex.title}</h2>
        <p class="lead">{content.aquarex.body}</p>
        <a class="text-link" href={`${base}/${data.locale}/solutions/aquarex/`}>Aquarex →</a>
      </div>
      <div class="technical-mark">
        <span>AQX</span><small>ACID / CAUSTIC<br />RECYCLING SYSTEMS</small>
      </div>
    </section>
    <section id="contact" class="contact-section section-pad">
      <div class="shell">
        <div class="section-head">
          <div>
            <p class="eyebrow light">07 / PROJECT INQUIRY</p>
            <h2>{content.contact.title}</h2>
          </div>
          <p>{content.contact.body}</p>
        </div>
        <InquiryForm {content} />
      </div>
    </section>
  {:else if path === 'capabilities'}
    <PageIntro
      eyebrow="ENGINEERING RANGE"
      heading={content.capabilities.title}
      body={content.capabilities.body}
    />
    <section class="section-pad shell">
      <div class="detail-grid">
        {#each capabilities as item}<a
            class="image-card"
            href={`${base}/${data.locale}/capabilities/${item.slug}/`}
            ><img src={asset(item.image)} alt="" width="720" height="520" /><span class="mono"
              >{item.code}</span
            >
            <h2>{display(item.slug)}</h2></a
          >{/each}
      </div>
    </section>
  {:else if segment === 'capabilities'}
    <PageIntro eyebrow="CAPABILITY" heading={display(slug)} body={content.capabilities.body} />
    <section class="split-section shell">
      <div>
        <h2>Scope</h2>
        <p class="lead">
          J&A supports design, programming, integration, testing, startup and troubleshooting for
          this discipline. Project scope follows the installed equipment, client standards and
          acceptance criteria.
        </p>
      </div>
      <img
        class="detail-image"
        src={asset(capabilities.find((item) => item.slug === slug)?.image ?? capabilities[0].image)}
        alt="Industrial automation equipment"
      />
    </section>
  {:else if path === 'industries'}
    <PageIntro
      eyebrow="OPERATING ENVIRONMENTS"
      heading={content.industries.title}
      body={content.industries.body}
    />
    <section class="section-pad shell">
      <div class="detail-grid">
        {#each industries as item}<a
            class="image-card"
            href={`${base}/${data.locale}/industries/${item.slug}/`}
            ><img src={asset(item.image)} alt="" width="720" height="520" /><span class="mono"
              >INDUSTRY</span
            >
            <h2>{display(item.slug)}</h2></a
          >{/each}
      </div>
    </section>
  {:else if segment === 'industries'}
    <PageIntro eyebrow="INDUSTRY" heading={display(slug)} body={content.industries.body} />
    <section class="split-section shell">
      <img
        class="detail-image"
        src={asset(industries.find((item) => item.slug === slug)?.image ?? industries[0].image)}
        alt="Industrial production environment"
      />
      <div>
        <h2>Plant-floor engineering</h2>
        <p class="lead">
          Controls work covers machine sequences, interlocks, supervisory systems, line interfaces,
          commissioning and production support according to the needs of each site.
        </p>
      </div>
    </section>
  {:else if path === 'projects'}
    <PageIntro
      eyebrow="HISTORICAL PUBLIC ARCHIVE"
      heading={content.projects.title}
      body={content.projects.body}
    />
    <section class="section-pad shell"><ProjectArchive /></section>
  {:else if segment === 'projects'}
    {@const project = projects.find((item) => item.slug === slug) ?? projects[0]}
    <PageIntro
      eyebrow={`${project.year} / ${project.region}`}
      heading={project.title}
      body={project.scope}
    />
    <section class="split-section shell">
      <div>
        <span class="mono">CLIENT</span>
        <h2>{project.client}</h2>
      </div>
      <div>
        <span class="mono">PLATFORM / DISCIPLINE</span>
        <h2>{project.technology}</h2>
        <p>
          Archive entries describe historical project work. Client names do not imply a current
          partnership or endorsement.
        </p>
      </div>
    </section>
  {:else if path === 'solutions/aquarex'}
    <PageIntro
      eyebrow="AQUAREX / APPLICATION ENGINEERING"
      heading={content.aquarex.title}
      body={content.aquarex.body}
    />
    <section class="split-section shell">
      <div>
        <h2>Application scope</h2>
        <p class="lead">
          J&A evaluates each application against site chemistry, process interfaces, controls and
          electrical requirements. An inquiry starts a technical review; it does not constitute a
          performance or compliance guarantee.
        </p>
      </div>
      <div><InquiryForm {content} kind="aquarex" /></div>
    </section>
  {:else if path === 'about'}
    <PageIntro
      eyebrow="FOUNDED 2008"
      heading="Automation engineers with field experience behind the code."
      body="J&A Automation works across controls engineering, robotics, commissioning and technical support for industrial production systems."
    />
    <section class="split-section shell">
      <div>
        <h2>Built around production.</h2>
        <p class="lead">
          Software must work with electrical hardware, robots, drives, mechanics, operators and
          production schedules. J&A engineers manage those interfaces from design through startup.
        </p>
      </div>
      <div class="fact-panel">
        <span class="mono">OPERATIONS</span><strong
          >United States<br />Brazil<br />International projects</strong
        >
      </div>
    </section>
  {:else if path === 'careers'}
    <PageIntro eyebrow="CAREERS" heading={content.careers.title} body={content.careers.body} />
    <section class="split-section shell">
      <div>
        <h2>Profiles of interest</h2>
        <ul class="plain-list">
          <li>PLC / controls engineering</li>
          <li>Robot programming</li>
          <li>Electrical design</li>
          <li>Commissioning and field support</li>
        </ul>
      </div>
      <InquiryForm {content} kind="career-interest" />
    </section>
  {:else if path === 'contact'}
    <PageIntro eyebrow="CONTACT" heading={content.contact.title} body={content.contact.body} />
    <section class="section-pad shell">
      <InquiryForm {content} kind="contact" />
      <div class="support-callout">
        <h2>{content.support}</h2>
        <p>
          For an active production problem, include the affected system, urgency, symptoms and
          recent changes.
        </p>
        <InquiryForm {content} kind="support" />
      </div>
    </section>
  {:else if path === 'privacy' || path === 'terms'}
    <PageIntro
      eyebrow="LEGAL REVIEW REQUIRED"
      heading={path === 'privacy' ? 'Privacy notice' : 'Terms of use'}
      body="J&A will publish the approved legal text before production launch."
    />
    <section class="legal shell">
      <p>
        This route reserves the localized legal page and prevents unreviewed terms from entering
        production. Contact J&A for current handling or contractual information.
      </p>
    </section>
  {/if}
</main>
<Footer locale={data.locale} {content} />

{#snippet PageIntro(eyebrow: string, heading: string, body: string)}
  <section class="page-intro">
    <div class="shell">
      <p class="eyebrow light">{eyebrow}</p>
      <h1>{heading}</h1>
      <p>{body}</p>
    </div>
  </section>
{/snippet}
