import type { Locale } from '@ja/i18n';

export type Copy = {
  nav: Record<string, string>;
  portal: string;
  talk: string;
  support: string;
  hero: { eyebrow: string; title: string; body: string };
  proof: readonly string[];
  intro: { title: string; body: string };
  capabilities: { title: string; body: string };
  industries: { title: string; body: string };
  projects: { title: string; body: string };
  aquarex: { title: string; body: string };
  careers: { title: string; body: string };
  contact: { title: string; body: string };
  form: Record<string, string>;
};

export const copy: Record<Locale, Copy> = {
  en: {
    nav: {
      capabilities: 'Capabilities',
      industries: 'Industries',
      projects: 'Projects',
      aquarex: 'Aquarex',
      about: 'About',
      careers: 'Careers',
    },
    portal: 'Employee Portal',
    talk: 'Talk to an Engineer',
    support: 'Request Technical Support',
    hero: {
      eyebrow: 'INDUSTRIAL AUTOMATION / CONTROLS ENGINEERING',
      title: 'Engineering that keeps production moving.',
      body: 'J&A Automation designs, integrates, commissions and supports PLC, HMI, SCADA, robotics and electrical control systems.',
    },
    proof: ['SINCE 2008', 'US + BRAZIL OPERATIONS', 'FIELD + REMOTE SUPPORT'],
    intro: {
      title: 'Controls engineering from design through stable production.',
      body: 'Our engineers work across control software, robotics, electrical interfaces, startup and troubleshooting. One team follows the machine from the first sequence review to the plant floor.',
    },
    capabilities: {
      title: 'Capabilities',
      body: 'PLC, HMI and SCADA engineering; robotics and line integration; electrical controls; simulation; motion and process control; commissioning, support and training.',
    },
    industries: {
      title: 'Industrial sectors',
      body: 'Automotive, food and beverage, cosmetics and packaging, energy and process, machine builders and general manufacturing.',
    },
    projects: {
      title: 'Selected Project Experience',
      body: 'A factual archive of published work across machines, lines and plants.',
    },
    aquarex: {
      title: 'Acid and caustic recycling',
      body: 'Aquarex supports acid and caustic recycling applications with the controls, electrical integration and site engineering required for an industrial installation.',
    },
    careers: {
      title: 'Work on controls where production happens.',
      body: 'J&A welcomes interest from controls engineers, robot programmers, electrical designers and commissioning specialists. We do not publish open vacancies on this page.',
    },
    contact: {
      title: 'Tell us what you need to automate or troubleshoot.',
      body: 'Include the machine or line, control platform, plant location and the result you need.',
    },
    form: {
      name: 'Name',
      company: 'Company',
      email: 'Work email',
      phone: 'Phone',
      site: 'Country / plant',
      industry: 'Industry',
      type: 'Project type',
      platform: 'Platform, if known',
      preference: 'Preferred contact',
      message: 'Scope or issue',
      send: 'Send inquiry',
      success: 'Request received. An engineer will review it.',
      error: 'The request could not be sent. Try again or contact J&A by phone.',
    },
  },
  pt: {
    nav: {
      capabilities: 'Capacidades',
      industries: 'Indústrias',
      projects: 'Projetos',
      aquarex: 'Aquarex',
      about: 'Empresa',
      careers: 'Carreiras',
    },
    portal: 'Portal da Equipe',
    talk: 'Fale com um engenheiro',
    support: 'Solicite suporte técnico',
    hero: {
      eyebrow: 'AUTOMAÇÃO INDUSTRIAL / ENGENHARIA DE CONTROLES',
      title: 'Engenharia que mantém a produção em movimento.',
      body: 'A J&A Automation projeta, integra, comissiona e oferece suporte a sistemas PLC, HMI, SCADA, robótica e controles elétricos.',
    },
    proof: ['DESDE 2008', 'OPERAÇÕES EUA + BRASIL', 'SUPORTE EM CAMPO + REMOTO'],
    intro: {
      title: 'Engenharia de controles, do projeto à produção estável.',
      body: 'Nossos engenheiros atuam em software de controle, robótica, interfaces elétricas, partida e diagnóstico. A mesma equipe acompanha a máquina até o chão de fábrica.',
    },
    capabilities: {
      title: 'Capacidades',
      body: 'Engenharia de PLC, HMI e SCADA; robótica e integração de linhas; controles elétricos; simulação; controle de movimento e processo; comissionamento, suporte e treinamento.',
    },
    industries: {
      title: 'Setores industriais',
      body: 'Automotivo, alimentos e bebidas, cosméticos e embalagens, energia e processos, fabricantes de máquinas e indústria em geral.',
    },
    projects: {
      title: 'Experiência selecionada em projetos',
      body: 'Arquivo factual de trabalhos publicados em máquinas, linhas e plantas.',
    },
    aquarex: {
      title: 'Reciclagem de ácidos e cáusticos',
      body: 'Aquarex atende aplicações de reciclagem de ácidos e cáusticos com controles, integração elétrica e engenharia de campo para instalações industriais.',
    },
    careers: {
      title: 'Trabalhe com controles onde a produção acontece.',
      body: 'A J&A recebe manifestações de interesse de engenheiros de controle, programadores de robôs, projetistas elétricos e especialistas em comissionamento. Esta página não anuncia vagas abertas.',
    },
    contact: {
      title: 'Conte o que você precisa automatizar ou diagnosticar.',
      body: 'Inclua a máquina ou linha, plataforma de controle, local da planta e o resultado esperado.',
    },
    form: {
      name: 'Nome',
      company: 'Empresa',
      email: 'E-mail profissional',
      phone: 'Telefone',
      site: 'País / planta',
      industry: 'Indústria',
      type: 'Tipo de projeto',
      platform: 'Plataforma, se conhecida',
      preference: 'Contato preferido',
      message: 'Escopo ou problema',
      send: 'Enviar consulta',
      success: 'Solicitação recebida. Um engenheiro fará a análise.',
      error: 'Não foi possível enviar. Tente novamente ou contate a J&A por telefone.',
    },
  },
  es: {
    nav: {
      capabilities: 'Capacidades',
      industries: 'Industrias',
      projects: 'Proyectos',
      aquarex: 'Aquarex',
      about: 'Empresa',
      careers: 'Carreras',
    },
    portal: 'Portal del Equipo',
    talk: 'Hable con un ingeniero',
    support: 'Solicite soporte técnico',
    hero: {
      eyebrow: 'AUTOMATIZACIÓN INDUSTRIAL / INGENIERÍA DE CONTROL',
      title: 'Ingeniería que mantiene la producción en marcha.',
      body: 'J&A Automation diseña, integra, pone en marcha y brinda soporte a sistemas PLC, HMI, SCADA, robótica y controles eléctricos.',
    },
    proof: ['DESDE 2008', 'OPERACIONES EE. UU. + BRASIL', 'SOPORTE EN CAMPO + REMOTO'],
    intro: {
      title: 'Ingeniería de control, desde el diseño hasta la producción estable.',
      body: 'Nuestros ingenieros trabajan con software de control, robótica, interfaces eléctricas, arranque y diagnóstico. El mismo equipo acompaña la máquina hasta la planta.',
    },
    capabilities: {
      title: 'Capacidades',
      body: 'Ingeniería de PLC, HMI y SCADA; robótica e integración de líneas; controles eléctricos; simulación; control de movimiento y procesos; puesta en marcha, soporte y formación.',
    },
    industries: {
      title: 'Sectores industriales',
      body: 'Automoción, alimentos y bebidas, cosmética y envases, energía y procesos, fabricantes de maquinaria e industria general.',
    },
    projects: {
      title: 'Experiencia seleccionada en proyectos',
      body: 'Archivo factual de trabajos publicados en máquinas, líneas y plantas.',
    },
    aquarex: {
      title: 'Reciclaje de ácidos y cáusticos',
      body: 'Aquarex atiende aplicaciones de reciclaje de ácidos y cáusticos con controles, integración eléctrica e ingeniería de campo para instalaciones industriales.',
    },
    careers: {
      title: 'Trabaje con controles donde ocurre la producción.',
      body: 'J&A recibe muestras de interés de ingenieros de control, programadores de robots, diseñadores eléctricos y especialistas en puesta en marcha. Esta página no anuncia vacantes abiertas.',
    },
    contact: {
      title: 'Cuéntenos qué necesita automatizar o diagnosticar.',
      body: 'Incluya la máquina o línea, plataforma de control, ubicación de la planta y el resultado esperado.',
    },
    form: {
      name: 'Nombre',
      company: 'Empresa',
      email: 'Correo de trabajo',
      phone: 'Teléfono',
      site: 'País / planta',
      industry: 'Industria',
      type: 'Tipo de proyecto',
      platform: 'Plataforma, si se conoce',
      preference: 'Contacto preferido',
      message: 'Alcance o problema',
      send: 'Enviar consulta',
      success: 'Solicitud recibida. Un ingeniero la revisará.',
      error: 'No se pudo enviar. Inténtelo de nuevo o llame a J&A.',
    },
  },
};

export const capabilities = [
  { slug: 'plc-hmi-scada', code: 'CTRL-01', image: '/images/capabilities/assembly-engines.jpg' },
  {
    slug: 'robotics-line-integration',
    code: 'ROBO-02',
    image: '/images/industries/robotics-cell-square.jpg',
  },
  {
    slug: 'electrical-controls',
    code: 'ELEC-03',
    image: '/images/industries/automotive-assembly.jpg',
  },
  {
    slug: 'simulation-offline-engineering',
    code: 'SIM-04',
    image: '/images/hero/hero-robotics.jpg',
  },
  {
    slug: 'motion-process-control',
    code: 'MOTION-05',
    image: '/images/industries/cosmetics-filling.jpg',
  },
  {
    slug: 'commissioning-support',
    code: 'FIELD-06',
    image: '/images/hero/hero-energy-process.jpg',
  },
] as const;

export const industries = [
  { slug: 'automotive', image: '/images/industries/automotive-body-shop.jpg' },
  { slug: 'food-beverage', image: '/images/industries/beverage-dark.jpg' },
  { slug: 'cosmetics-packaging', image: '/images/industries/cosmetics-filling.jpg' },
  { slug: 'energy-process', image: '/images/hero/hero-energy-process.jpg' },
  { slug: 'oem-general-industry', image: '/images/industries/automotive-assembly.jpg' },
] as const;

export const projects = [
  {
    slug: 'incobrasa-silo-expansion',
    year: '2019',
    client: 'Incobrasa',
    industry: 'food-beverage',
    technology: 'Rockwell / Wonderware',
    capability: 'plc-hmi-scada',
    region: 'Americas',
    title: 'Soybean cleaner and silo expansion',
    scope: 'Automation design for a silo-control expansion in a soybean drying process.',
  },
  {
    slug: 'ford-schuler-stamping-press',
    year: '2018–2019',
    client: 'Ford',
    industry: 'automotive',
    technology: 'Industrial controls',
    capability: 'commissioning-support',
    region: 'United States',
    title: 'Schuler stamping press',
    scope: 'Controls improvement, troubleshooting, commissioning and equipment service.',
  },
  {
    slug: 'bmw-spartanburg-marriage-line',
    year: '2018',
    client: 'BMW',
    industry: 'automotive',
    technology: 'PLC / robotics',
    capability: 'robotics-line-integration',
    region: 'South Carolina, USA',
    title: 'Powertrain and body marriage line',
    scope: 'PLC and robot integration across an automotive assembly line.',
  },
  {
    slug: 'heineken-haiti-kaizen',
    year: '2016–2017',
    client: 'Heineken',
    industry: 'food-beverage',
    technology: 'Line controls',
    capability: 'commissioning-support',
    region: 'Haiti',
    title: 'Bottling-line improvement',
    scope: 'Production-line audit and cross-functional improvement work.',
  },
  {
    slug: 'p75-vapor-recovery-unit',
    year: '2016',
    client: 'Industrial project',
    industry: 'energy-process',
    technology: 'PLC / HMI',
    capability: 'electrical-controls',
    region: 'Brazil',
    title: 'Vapor recovery unit P-75',
    scope: 'Electrical and automation development, FAT, FMEA and project documentation.',
  },
  {
    slug: 'paresa-conveyor-changes',
    year: '2017',
    client: 'Paresa',
    industry: 'food-beverage',
    technology: 'Siemens S7',
    capability: 'plc-hmi-scada',
    region: 'Paraguay',
    title: 'Bottle conveyor changes',
    scope: 'Conveyor speed settings and interlock changes.',
  },
] as const;

export const staticPaths = [
  'capabilities',
  ...capabilities.map((item) => `capabilities/${item.slug}`),
  'industries',
  ...industries.map((item) => `industries/${item.slug}`),
  'projects',
  ...projects.map((item) => `projects/${item.slug}`),
  'solutions/aquarex',
  'about',
  'careers',
  'contact',
  'privacy',
  'terms',
];
