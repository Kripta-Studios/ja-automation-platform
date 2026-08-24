import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { projects } from '../website/content/projects';

type ProjectCopy = {
  title: string;
  scope: string;
  outcome?: string;
  displayDate: string;
};

const projectCopies: Record<string, { es: ProjectCopy; pt: ProjectCopy }> = {
  'incobrasa-silo-2019': {
    es: {
      title: 'Ampliación del limpiador y silos para soja',
      scope:
        'Diseño de automatización para la ampliación del control de silos en un proceso de secado de soja usando controles PLC Rockwell y supervisión Wonderware InTouch.',
      displayDate: '2019',
    },
    pt: {
      title: 'Expansão do limpador e dos silos para soja',
      scope:
        'Projeto de automação para expansão do controle de silos em um processo de secagem de soja usando controles PLC Rockwell e supervisão Wonderware InTouch.',
      displayDate: '2019',
    },
  },
  'incobrasa-oil-2019': {
    es: {
      title: 'Cambios de automatización en línea de llenado de aceite de soja',
      scope:
        'Cambios en transportadores para producción y confiabilidad, cambios en el paletizador para una nueva formación de pallets e integración de señales del etiquetador y transportadores.',
      displayDate: '2019',
    },
    pt: {
      title: 'Alterações de automação na linha de envase de óleo de soja',
      scope:
        'Alterações nos transportadores para produção e confiabilidade, mudanças no paletizador para uma nova formação de pallets e integração de sinais do rotulador e dos transportadores.',
      displayDate: '2019',
    },
  },
  'ford-schuler-2018': {
    es: {
      title: 'Prensa de estampado Schuler',
      scope:
        'Mejora de automatización, diagnóstico de fallas, puesta en marcha y servicio para equipos de estampado.',
      displayDate: '2018–2019',
    },
    pt: {
      title: 'Prensa de estamparia Schuler',
      scope:
        'Melhoria de automação, diagnóstico de falhas, comissionamento e serviço para equipamentos de estamparia.',
      displayDate: '2018–2019',
    },
  },
  'chicago-tower-2018': {
    es: {
      title: 'Taller de carrocería Chicago Tower',
      scope: 'Integración de PLC del taller de carrocería.',
      displayDate: '2018–2019',
    },
    pt: {
      title: 'Funilaria Chicago Tower',
      scope: 'Integração de PLC da funilaria.',
      displayDate: '2018–2019',
    },
  },
  'bmw-wire-harness-2018': {
    es: {
      title: 'Horno de arneses eléctricos',
      scope: 'Ampliación del horno de arneses eléctricos.',
      displayDate: '2018',
    },
    pt: {
      title: 'Forno de chicotes elétricos',
      scope: 'Extensão do forno de chicotes elétricos.',
      displayDate: '2018',
    },
  },
  'bmw-marriage-2018': {
    es: {
      title: 'Línea de unión de carrocería y tren motriz',
      scope: 'Integración de PLC y robots en la línea de unión de carrocería y tren motriz.',
      displayDate: '2018',
    },
    pt: {
      title: 'Linha de união de carroceria e powertrain',
      scope: 'Integração de PLC e robôs na linha de união de carroceria e powertrain.',
      displayDate: '2018',
    },
  },
  'bmw-hatch-2017': {
    es: {
      title: 'Asistencia de elevación de portón',
      scope: 'Controles de asistencia de elevación de portón.',
      displayDate: '2017–2018',
    },
    pt: {
      title: 'Assistência de elevação da tampa',
      scope: 'Controles de assistência para elevação da tampa.',
      displayDate: '2017–2018',
    },
  },
  'bmw-pokayoke-2017': {
    es: {
      title: 'Poka-yoke de llenado de aceite diferencial',
      scope: 'Interbloqueo para evitar la colocación incorrecta de la boquilla de llenado.',
      displayDate: '2017',
    },
    pt: {
      title: 'Poka-yoke de envase de óleo diferencial',
      scope: 'Intertravamento para evitar o posicionamento incorreto do bico de abastecimento.',
      displayDate: '2017',
    },
  },
  'bmw-nvld-2017': {
    es: {
      title: 'NVLD',
      scope: 'Puesta en marcha, mejoras de interbloqueos y aceptación del cliente.',
      displayDate: '2017',
    },
    pt: {
      title: 'NVLD',
      scope: 'Comissionamento, melhorias de intertravamento e aceitação do cliente.',
      displayDate: '2017',
    },
  },
  'kister-servo-2017': {
    es: {
      title: 'Actualización de servos del empacador Kister',
      scope: 'Actualización de doble servo para separación de paquetes; cambios de HMI/PLC.',
      displayDate: '2017',
    },
    pt: {
      title: 'Upgrade de servos da empacotadora Kister',
      scope: 'Upgrade de servos duplos para separação de pacotes; alterações de IHM/PLC.',
      displayDate: '2017',
    },
  },
  'paresa-conveyor-2017': {
    es: {
      title: 'Cambios en transportadores',
      scope: 'Ajustes de velocidad de transportadores de botellas y cambios de interbloqueos.',
      displayDate: '2017',
    },
    pt: {
      title: 'Alterações nos transportadores',
      scope:
        'Ajustes de velocidade dos transportadores de garrafas e alterações de intertravamento.',
      displayDate: '2017',
    },
  },
  'heineken-kaizen-2016': {
    es: {
      title: 'Kaizen de línea de embotellado',
      scope:
        'Auditoría de línea de producción y trabajo de mejora multifuncional con operaciones, mantenimiento y planificación de suministro.',
      outcome: 'El registro publicado informa un aumento de 20 puntos en la eficiencia promedio.',
      displayDate: '2016–2017',
    },
    pt: {
      title: 'Kaizen de linha de envase',
      scope:
        'Auditoria da linha de produção e trabalho de melhoria multifuncional envolvendo operações, manutenção e planejamento de suprimentos.',
      outcome: 'O registro publicado informa um aumento de 20 pontos na eficiência média.',
      displayDate: '2016–2017',
    },
  },
  'p75-vru-2016': {
    es: {
      title: 'Unidad de recuperación de vapores P-75',
      scope:
        'Desarrollo eléctrico y de automatización para una unidad de recuperación de vapores de petróleo y gas, incluidos FAT, FMEA y documentación del proyecto.',
      displayDate: '2016',
    },
    pt: {
      title: 'Unidade de recuperação de vapores P-75',
      scope:
        'Desenvolvimento elétrico e de automação para uma unidade de recuperação de vapores de óleo e gás, incluindo FAT, FMEA e documentação do projeto.',
      displayDate: '2016',
    },
  },
  'porto-acu-2016': {
    es: {
      title: 'Control e interbloqueo de compresor de aire',
      scope: 'Desarrollo de PLC/HMI y puesta en marcha.',
      displayDate: '2016',
    },
    pt: {
      title: 'Controle e intertravamento de compressor de ar',
      scope: 'Desenvolvimento de PLC/IHM e comissionamento.',
      displayDate: '2016',
    },
  },
  'p75-nitrogen-2016': {
    es: {
      title: 'Generador de nitrógeno P75 Petrobras',
      scope:
        'Desarrollo de automatización, documentación, puesta en marcha y FAT/FMEA para ambiente Exd.',
      displayDate: '2016',
    },
    pt: {
      title: 'Gerador de nitrogênio P75 Petrobras',
      scope:
        'Desenvolvimento de automação, documentação, comissionamento e FAT/FMEA para ambiente Exd.',
      displayDate: '2016',
    },
  },
  'p70-nitrogen-2016': {
    es: {
      title: 'Generador de nitrógeno P70 Petrobras',
      scope:
        'Desarrollo de automatización, documentación, puesta en marcha y FAT/FMEA para ambiente Exd.',
      displayDate: '2016',
    },
    pt: {
      title: 'Gerador de nitrogênio P70 Petrobras',
      scope:
        'Desenvolvimento de automação, documentação, comissionamento e FAT/FMEA para ambiente Exd.',
      displayDate: '2016',
    },
  },
  'p71-nitrogen-2016': {
    es: {
      title: 'Generador de nitrógeno P71 Petrobras',
      scope:
        'Desarrollo de automatización, documentación, puesta en marcha y FAT/FMEA para ambiente Exd.',
      displayDate: '2016',
    },
    pt: {
      title: 'Gerador de nitrogênio P71 Petrobras',
      scope:
        'Desenvolvimento de automação, documentação, comissionamento e FAT/FMEA para ambiente Exd.',
      displayDate: '2016',
    },
  },
  'rexam-trimmer-2015': {
    es: {
      title: 'Reacondicionamiento de máquina recortadora',
      scope:
        'Gestión de la revisión de cinco máquinas, piezas y coordinación de técnicos de servicio.',
      displayDate: '2015',
    },
    pt: {
      title: 'Reforma de máquina aparadora',
      scope: 'Gestão da reforma de cinco máquinas, peças e coordenação de técnicos de serviço.',
      displayDate: '2015',
    },
  },
  'avon-hotfill-2015': {
    es: {
      title: 'Línea de maquillaje hot-fill',
      scope:
        'Automatización PLC/HMI, integración de línea, puesta en marcha, FAT y SAT en equipos de indexación de botellas, llenado, tapado, enfriamiento, pick-and-place y etiquetado.',
      displayDate: '2015',
    },
    pt: {
      title: 'Linha de maquiagem hot-fill',
      scope:
        'Automação PLC/IHM, integração de linha, comissionamento, FAT e SAT em equipamentos de indexação de garrafas, envase, tampamento, resfriamento, pick-and-place e rotulagem.',
      displayDate: '2015',
    },
  },
  'avon-filler-2015': {
    es: {
      title: 'Indexación de botellas y llenadora',
      scope: 'Desarrollo de automatización PLC/HMI, pruebas, puesta en marcha y FAT/SAT.',
      displayDate: '2015',
    },
    pt: {
      title: 'Indexação de garrafas e enchedora',
      scope: 'Desenvolvimento de automação PLC/IHM, testes, comissionamento e FAT/SAT.',
      displayDate: '2015',
    },
  },
  'aquarex-png-2014': {
    es: {
      title: 'Sistema de recuperación cáustica Aquarex',
      scope:
        'Actualización de automatización y electricidad para un sistema de recuperación cáustica Aquarex.',
      displayDate: '2014',
    },
    pt: {
      title: 'Sistema de recuperação cáustica Aquarex',
      scope: 'Upgrade de automação e elétrica para um sistema de recuperação cáustica Aquarex.',
      displayDate: '2014',
    },
  },
  'campari-capper-2014': {
    es: {
      title: 'Alimentador de tapas para taponadora Zalkin',
      scope:
        'Modificación de software PLC para integrar una nueva taponadora con la llenadora Krones.',
      displayDate: '2014',
    },
    pt: {
      title: 'Alimentador de tampas para tampadora Zalkin',
      scope: 'Modificação de software PLC para integrar uma nova tampadora à enchedora Krones.',
      displayDate: '2014',
    },
  },
  'heineken-haiti-2014': {
    es: {
      title: 'Línea de llenado de 40.000 botellas/hora',
      scope:
        'Puesta en marcha, aumento gradual de producción, mejora de eficiencia y operación asistida.',
      displayDate: '2014',
    },
    pt: {
      title: 'Linha de envase de 40.000 garrafas/hora',
      scope:
        'Comissionamento, aumento gradual da produção, melhoria de eficiência e operação assistida.',
      displayDate: '2014',
    },
  },
  'femsa-filler-2013': {
    es: {
      title: 'Ajuste de sincronización neumática de llenadora',
      scope:
        'Cambios de software para levas neumáticas y cambios de mezclador para producción de agua con gas.',
      displayDate: '2013',
    },
    pt: {
      title: 'Ajuste de sincronismo pneumático da enchedora',
      scope:
        'Alterações de software para cames pneumáticos e mudanças no misturador para produção de água gaseificada.',
      displayDate: '2013',
    },
  },
  'avon-puck-2013': {
    es: {
      title: 'Actualización de transportador de pucks',
      scope:
        'Modificación del transportador para crear un buffer de pucks en la entrada de la llenadora.',
      displayDate: '2013',
    },
    pt: {
      title: 'Upgrade do transportador de pucks',
      scope: 'Modificação do transportador para criar um buffer de pucks na entrada da enchedora.',
      displayDate: '2013',
    },
  },
  'boticario-cartoner-2013': {
    es: {
      title: 'Encartonadora CMF 60/min',
      scope: 'Montaje, puesta en marcha, arranque, FAT, IQ/OQ y localización de documentación.',
      displayDate: '2013',
    },
    pt: {
      title: 'Encartuchadora CMF 60/min',
      scope: 'Montagem, comissionamento, partida, FAT, IQ/OQ e localização da documentação.',
      displayDate: '2013',
    },
  },
  'scjohnson-filler-2013': {
    es: {
      title: 'Llenadora de repelente de insectos',
      scope: 'Montaje, puesta en marcha, arranque y aumento gradual de producción.',
      displayDate: '2013',
    },
    pt: {
      title: 'Enchedora de repelente de insetos',
      scope: 'Montagem, comissionamento, partida e aumento gradual da produção.',
      displayDate: '2013',
    },
  },
  'avon-mexico-2013': {
    es: {
      title: 'Pick-and-place de tapas',
      scope: 'Sistema robótico de alimentación de tapas; puesta en marcha y arranque.',
      displayDate: '2013',
    },
    pt: {
      title: 'Pick-and-place de tampas',
      scope: 'Sistema robótico de alimentação de tampas; comissionamento e partida.',
      displayDate: '2013',
    },
  },
  'panco-conveyor-2012': {
    es: {
      title: 'Transportador de aire por lotes para harina',
      scope: 'Desarrollo de software, puesta en marcha y pruebas de producción.',
      displayDate: '2012',
    },
    pt: {
      title: 'Transportador de ar por batelada para farinha',
      scope: 'Desenvolvimento de software, comissionamento e testes de produção.',
      displayDate: '2012',
    },
  },
  'hyosung-tank-2012': {
    es: {
      title: 'Control de tanque químico',
      scope: 'Control de presión y control en lazo cerrado.',
      displayDate: '2012',
    },
    pt: {
      title: 'Controle de tanque químico',
      scope: 'Controle de pressão e controle em malha fechada.',
      displayDate: '2012',
    },
  },
  'ambev-pet-2012': {
    es: {
      title: 'Cambio de formato PET de 500 ml',
      scope: 'Cambio de software del transportador de aire.',
      displayDate: '2012',
    },
    pt: {
      title: 'Troca de formato PET de 500 ml',
      scope: 'Alteração do software do transportador de ar.',
      displayDate: '2012',
    },
  },
  'soy-oil-overhaul-2012': {
    es: {
      title: 'Reacondicionamiento de línea de aceite de soja',
      scope: 'Arranque y puesta en marcha después de una revisión mecánica.',
      displayDate: '2012',
    },
    pt: {
      title: 'Reforma da linha de óleo de soja',
      scope: 'Partida e comissionamento após reforma mecânica.',
      displayDate: '2012',
    },
  },
  'petropolis-269-2011': {
    es: {
      title: 'Formato de 269/473 ml',
      scope: 'Creación y adaptación de recetas para ambos formatos.',
      displayDate: '2011',
    },
    pt: {
      title: 'Formato de 269/473 ml',
      scope: 'Criação e adaptação de receitas para os dois formatos.',
      displayDate: '2011',
    },
  },
  'petropolis-ice-2011': {
    es: {
      title: 'Cambio de formato Blue Spirit Ice',
      scope: 'Modificación de receta y software para nuevas botellas.',
      displayDate: '2011',
    },
    pt: {
      title: 'Troca de formato Blue Spirit Ice',
      scope: 'Modificação de receita e software para novas garrafas.',
      displayDate: '2011',
    },
  },
  'bombril-soap-2011': {
    es: {
      title: 'Línea de llenado de jabón para platos',
      scope: 'Puesta en marcha, arranque y aumento gradual de producción de la línea.',
      displayDate: '2011',
    },
    pt: {
      title: 'Linha de envase de detergente',
      scope: 'Comissionamento, partida e aumento gradual da produção da linha.',
      displayDate: '2011',
    },
  },
  'campari-filling-2010': {
    es: {
      title: 'Línea de llenado de 18.000 botellas/hora',
      scope: 'Montaje, puesta en marcha y pruebas de producción.',
      displayDate: '2010',
    },
    pt: {
      title: 'Linha de envase de 18.000 garrafas/hora',
      scope: 'Montagem, comissionamento e testes de produção.',
      displayDate: '2010',
    },
  },
  'sabb-hotfill-2010': {
    es: {
      title: 'Línea de producción hot-fill',
      scope: 'Puesta en marcha, arranque y pruebas de producción.',
      displayDate: '2010',
    },
    pt: {
      title: 'Linha de produção hot-fill',
      scope: 'Comissionamento, partida e testes de produção.',
      displayDate: '2010',
    },
  },
  'cocacola-labeler-2010': {
    es: {
      title: 'Etiquetadora PET y transportador de entrada',
      scope:
        'Montaje, puesta en marcha y pruebas de producción; referencia Contiroll de 15.000 botellas por hora.',
      displayDate: '2010',
    },
    pt: {
      title: 'Rotuladora PET e transportador de entrada',
      scope:
        'Montagem, comissionamento e testes de produção; referência Contiroll de 15.000 garrafas por hora.',
      displayDate: '2010',
    },
  },
  'unilever-ades-2008': {
    es: {
      title: 'Formulación continua',
      scope: 'Desarrollo de software, puesta en marcha y pruebas de producción.',
      displayDate: '2008',
    },
    pt: {
      title: 'Formulação contínua',
      scope: 'Desenvolvimento de software, comissionamento e testes de produção.',
      displayDate: '2008',
    },
  },
  'usiminas-ute-2007': {
    es: {
      title: 'UTE Usiminas',
      scope: 'Desarrollo de HMI y sistema de supervisión.',
      displayDate: 'Experiencia previa',
    },
    pt: {
      title: 'UTE Usiminas',
      scope: 'Desenvolvimento de IHM e sistema supervisório.',
      displayDate: 'Experiência anterior',
    },
  },
  'bmw-hatch-undated': {
    es: {
      title: 'Elevación de portón',
      scope:
        'Diseño de proyecto, mejoras de interbloqueos, puesta en marcha de Festo CPMAX, integración IPS y diseño de HMI (V8).',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Elevação de tampa',
      scope:
        'Projeto, melhorias de intertravamento, comissionamento do Festo CPMAX, integração IPS e projeto de IHM (V8).',
      displayDate: 'Ano não especificado',
    },
  },
  'bmw-abs-undated': {
    es: {
      title: 'Reconstrucción de probador ABS',
      scope: 'Puesta en marcha de Movidrive y arranque del sistema.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Reconstrução do testador ABS',
      scope: 'Comissionamento do Movidrive e partida do sistema.',
      displayDate: 'Ano não especificado',
    },
  },
  'bmw-console-undated': {
    es: {
      title: 'Transportador de consolas',
      scope: 'Diseño de proyecto, puesta en marcha y diseño de seguridad conforme al estándar BMW.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Transportador de consoles',
      scope: 'Projeto, comissionamento e projeto de segurança conforme o padrão BMW.',
      displayDate: 'Ano não especificado',
    },
  },
  'bmw-shifter-undated': {
    es: {
      title: 'Ensambladora de palancas manuales',
      scope: 'Puesta en marcha, mejoras de interbloqueos e integración IPS.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Montadora de alavanca manual',
      scope: 'Comissionamento, melhorias de intertravamento e integração IPS.',
      displayDate: 'Ano não especificado',
    },
  },
  'foaming-station-undated': {
    es: {
      title: 'Estación de espumado',
      scope: 'Puesta en marcha y mejoras de interbloqueos.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Estação de espumação',
      scope: 'Comissionamento e melhorias de intertravamento.',
      displayDate: 'Ano não especificado',
    },
  },
  'cocacola-krones-undated': {
    es: {
      title: 'Reconstrucción de línea de llenado Krones',
      scope: 'Arranque después de la reconstrucción.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Reforma da linha de envase Krones',
      scope: 'Partida após a reforma.',
      displayDate: 'Ano não especificado',
    },
  },
  'cocacola-khs-undated': {
    es: {
      title: 'Actualización KHS Kister',
      scope: 'Cambios de software y puesta en marcha.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Upgrade KHS Kister',
      scope: 'Alterações de software e comissionamento.',
      displayDate: 'Ano não especificado',
    },
  },
  'cocacola-paraguay-undated': {
    es: {
      title: 'Adición de formato en transportador',
      scope: 'Integración de software.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Adição de formato no transportador',
      scope: 'Integração de software.',
      displayDate: 'Ano não especificado',
    },
  },
  'mercedes-bodyshop-undated': {
    es: {
      title: 'Taller de carrocería',
      scope: 'Trabajo de automatización del taller de carrocería.',
      displayDate: 'Año no especificado',
    },
    pt: {
      title: 'Funilaria',
      scope: 'Trabalho de automação da funilaria.',
      displayDate: 'Ano não especificado',
    },
  },
};

const additions = {
  en: {
    meta: {
      industriesTitle: 'Industrial Automation Industries | J&A Automation',
      industriesDescription:
        'Explore the industrial sectors where J&A Automation delivers controls, robotics, integration and commissioning.',
    },
    nav: {
      mainNavigation: 'Main navigation',
      languageSelector: 'Language selector',
      navigationMenu: 'Navigation menu',
      siteHome: 'J&A Automation home',
      logoAlt: 'J&A Automation logo',
      switchTo: 'Switch to {language}',
      languageNames: { en: 'English', pt: 'Português', es: 'Español' },
      languageLabels: { en: 'EN', pt: 'PT-BR', es: 'ES' },
    },
    common: {
      backToCapabilities: 'Back to Capabilities',
      backToIndustries: 'Back to Industries',
      backToProjects: 'Back to Projects',
      relatedProjectExperience: 'Related Project Experience',
      projectExperience: 'Project Experience',
      projectScope: 'Project Scope',
      outcome: 'Outcome',
      capabilitiesApplied: 'Capabilities Applied',
      technologies: 'Technologies',
      exploreCapability: 'Explore capability',
      viewAllProjects: 'View all projects',
      viewProjectsInIndustry: 'View projects in this industry',
      discussSimilarProject: 'Discuss a similar project',
      contactEngineeringTeam: 'Contact our Engineering Team',
      needEngineeringSupport: 'Need engineering support for {capability}?',
      needSectorSupport: 'Need engineering support in this sector?',
      projectsCount: '{shown} / {total} projects',
      notFound: 'Not Found',
      tryAgain: 'Try Again',
      returnHome: 'Return to Home',
      pageNotFound: 'Page Not Found',
      pageMissingBody:
        'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.',
      loading: 'Loading…',
    },
    imageAlts: {
      logo: 'J&A Automation Industrial Solutions',
      heroRobotics: 'Industrial robotic assembly line',
      heroFoodBeverage: 'Food and beverage production line',
      heroEnergyProcess: 'Energy and process industrial plant',
      automotive: 'Industrial robotic automotive body shop',
      foodBeverage: 'Food and beverage production line',
      energyProcess: 'Energy and process industrial plant',
      cosmeticsPackaging: 'Cosmetics filling production line',
      oemGeneral: 'Industrial robotic cell',
      assembly: 'State of the art automated assembly line',
    },
    intro: {
      p2: 'From new systems and line upgrades through commissioning, troubleshooting and remote support, our team works across the full automation lifecycle with a practical focus on what needs to work on the factory floor.',
    },
    clients: { eyebrow: 'Selected experience', logoAlt: '{name} logo' },
    capabilities: { explore: 'Explore capability' },
    industries: {
      lead: 'J&A Automation builds, integrates, and supports industrial control systems across multiple sectors.',
      viewProjects: 'View projects in this industry',
    },
    remoteSupport: {
      coverageEyebrow: 'Field + remote coverage',
      coveragePlcHmi: 'PLC / HMI',
      coverageRobotics: 'Robotics',
      coverageDrivesMotion: 'Drives + motion',
      coverageProductionStartup: 'Production startup',
    },
    projectFilters: {
      formLabel: 'Project filters',
      projectCount: '{shown} / {total} projects',
      trainingConsulting: 'Training / consulting',
    },
    serviceTags: {
      siemens: 'Siemens',
      rockwell: 'Rockwell',
      wincc: 'WinCC',
      factoryTalk: 'FactoryTalk',
      fanuc: 'FANUC',
      kuka: 'KUKA',
      abb: 'ABB',
      yaskawa: 'Yaskawa',
      processSimulate: 'Process Simulate',
      robotStudio: 'RobotStudio',
      offlineEngineering: 'Offline engineering',
      eplan: 'EPLAN',
      autoCadElectrical: 'AutoCAD Electrical',
      panels: 'Panels',
      safetyInterfaces: 'Safety interfaces',
      vfd: 'VFD',
      servo: 'Servo',
      motion: 'Motion',
      pid: 'PID',
      fat: 'FAT',
      sat: 'SAT',
      startup: 'Startup',
      rampUp: 'Ramp-up',
      remoteSupport: 'Remote support',
      troubleshooting: 'Troubleshooting',
      training: 'Training',
      consulting: 'Consulting',
    },
    serviceOptions: { trainingConsulting: 'Training / consulting' },
    about: {
      storyP3:
        'Our philosophy is simple: engineering excellence drives reliability. We build code structures that are modular, robust, and designed for the real-world conditions of the factory floor.',
      founded: 'Founded',
      offices: 'Offices (USA & Brazil)',
      projectsCompleted: 'Projects Completed',
      standard: 'The J&A Standard',
      modularEngineering: 'Modular Engineering',
      modularEngineeringBody:
        'We develop PLC and HMI codebases using object-oriented principles. Standardized Add-On Instructions (AOIs) ensure consistency, reduce debugging time, and make our systems scalable.',
      oemIndependent: 'OEM Independent',
      oemIndependentBody:
        'While we have deep expertise in Rockwell, Siemens, and KUKA, we remain hardware-agnostic. We architect the best solution for your specific technical requirements and budget.',
      lifecycleSupport: 'Lifecycle Support',
      lifecycleSupportBody:
        'Commissioning is not the end. We provide comprehensive documentation, operator training, and secure remote support infrastructure to ensure your line runs at peak OEE for decades.',
      joinTeam: 'Join Our Team',
      joinTeamBody:
        'We are always looking for talented PLC engineers, robotics specialists, and electrical designers to join our growing operations in the USA and Brazil.',
      careerOpportunities: 'View Career Opportunities',
    },
    aquarex: {
      eyebrow: 'Proprietary Solution',
      subtitle: 'Intelligent Control System for Industrial Water Treatment & Reverse Osmosis.',
      requestDatasheet: 'Request Technical Datasheet',
      talkToEngineer: 'Talk to an Engineer',
      systemAdvantages: 'System Advantages',
      monitoring: 'Real-time Monitoring',
      monitoringBody:
        'Continuous data acquisition for conductivity, pH, flow rates, and pressure across all treatment stages.',
      architecture: 'Standardized Architecture',
      architectureBody:
        'Pre-engineered PLC/HMI codebase reduces commissioning time by up to 40% while ensuring rock-solid reliability.',
      compliance: 'Compliance Ready',
      complianceBody:
        'Built-in data logging and reporting tools designed to meet stringent food, beverage, and pharmaceutical regulations.',
      processControl: 'Standardized Process Control',
      processBody:
        'The Aquarex platform integrates seamlessly with Reverse Osmosis (RO) units, Ultrafiltration (UF), and chemical dosing systems. It provides a unified HMI interface for operators and standardizes data structures for easy ERP/MES integration.',
      skidIntegration: 'Skid Integration',
      skidIntegrationBody: 'Plug-and-play logic blocks for common OEM skids.',
      chemicalDosing: 'Chemical Dosing',
      chemicalDosingBody:
        'Precise closed-loop control of dosing pumps based on in-line sensor feedback.',
      alarmManagement: 'Alarm Management',
      alarmManagementBody: 'ISA 18.2 compliant alarm structures for rapid troubleshooting.',
      diagramAria: 'Aquarex Architecture Diagram',
      diagramCore: 'AQUAREX CORE PLC',
      diagramHmi: 'SCADA / HMI',
      diagramSensors: 'Sensors (pH, Cond)',
      diagramFlowMeters: 'Flow Meters',
      diagramDosingPumps: 'Dosing Pumps',
      diagramVfdMotors: 'VFDs / Motors',
      diagramValves: 'Valves',
      datasheetHeading: 'Request Technical Datasheet',
      datasheetBody:
        'Enter your details to receive the complete Aquarex specification guide, IO list, and integration requirements.',
      firstName: 'First Name',
      lastName: 'Last Name',
      workEmail: 'Work Email',
      company: 'Company',
      sendDatasheet: 'Send Datasheet',
      privacyNote:
        'By requesting this datasheet, you agree to our privacy policy. We will never share your information.',
    },
    contact: {
      primaryTitle: 'Chief Executive Officer',
      website: 'Website',
      companyRequired: 'Company',
      countrySite: 'Country / Site',
      primaryService: 'Primary Service of Interest',
      technologyPlatform: 'Technology / Platform',
      plcRobotPlaceholder: 'PLC, robot, SCADA, controls…',
      emailOption: 'Email',
      phoneOption: 'Phone',
      siteFacility: 'Site / Facility',
      plantLocationPlaceholder: 'Plant, site or system location',
      affectedSystem: 'Affected System / Platform',
      plcHmiPlaceholder: 'PLC, robot, HMI, SCADA…',
      urgency: 'Urgency',
      productionStopped: 'Production stopped',
      degraded: 'Degraded',
      plannedSupport: 'Planned support',
      location: 'Location',
      professionalProfile: 'Professional Profile',
      controlsPlaceholder: 'Controls, robotics, electrical…',
      platformsExperience: 'Platforms / Experience',
      experiencePlaceholder: 'PLC, robot, HMI or other experience',
      travelAvailability: 'Travel Availability',
      travelYes: 'Yes',
      travelLimited: 'Limited',
      travelNo: 'No',
      industryAutomotive: 'Automotive',
      industryFoodBeverage: 'Food and beverage',
      industryEnergyProcess: 'Energy and process',
      industryGeneralManufacturing: 'General manufacturing',
      industryOther: 'Other / not sure',
      aquarexWaterTreatment: 'Aquarex Water Treatment',
      otherNotSure: 'Other / Not Sure',
    },
    careers: { workH2: 'What the work can involve' },
    error: {
      tryAgain: 'Try Again',
      returnHome: 'Return to Home',
      unexpected: 'An unexpected error has occurred. Our engineering team has been notified.',
    },
    notFound: {
      pageTitle: 'Page Not Found',
      pageMissingBody:
        'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.',
      returnHome: 'Return to Home',
    },
  },
  es: {
    meta: {
      industriesTitle: 'Industrias de Automatización Industrial | J&A Automation',
      industriesDescription:
        'Explore los sectores industriales donde J&A Automation ofrece controles, robótica, integración y puesta en marcha.',
    },
    nav: {
      mainNavigation: 'Navegación principal',
      languageSelector: 'Selector de idioma',
      navigationMenu: 'Menú de navegación',
      siteHome: 'Inicio de J&A Automation',
      logoAlt: 'Logotipo de J&A Automation',
      switchTo: 'Cambiar a {language}',
      languageNames: { en: 'inglés', pt: 'portugués de Brasil', es: 'español' },
      languageLabels: { en: 'EN', pt: 'PT-BR', es: 'ES' },
    },
    common: {
      backToCapabilities: 'Volver a capacidades',
      backToIndustries: 'Volver a industrias',
      backToProjects: 'Volver a proyectos',
      relatedProjectExperience: 'Experiencia relacionada en proyectos',
      projectExperience: 'Experiencia en proyectos',
      projectScope: 'Alcance del proyecto',
      outcome: 'Resultado',
      capabilitiesApplied: 'Capacidades aplicadas',
      technologies: 'Tecnologías',
      exploreCapability: 'Explorar capacidad',
      viewAllProjects: 'Ver todos los proyectos',
      viewProjectsInIndustry: 'Ver proyectos de esta industria',
      discussSimilarProject: 'Hablemos de un proyecto similar',
      contactEngineeringTeam: 'Contactar al equipo de ingeniería',
      needEngineeringSupport: '¿Necesita soporte de ingeniería para {capability}?',
      needSectorSupport: '¿Necesita soporte de ingeniería en este sector?',
      projectsCount: '{shown} / {total} proyectos',
      notFound: 'No encontrado',
      tryAgain: 'Intentar de nuevo',
      returnHome: 'Volver al inicio',
      pageNotFound: 'Página no encontrada',
      pageMissingBody:
        'La página que busca pudo haber sido eliminada, cambiado de nombre o no estar disponible temporalmente.',
      loading: 'Cargando…',
    },
    imageAlts: {
      logo: 'Soluciones industriales de J&A Automation',
      heroRobotics: 'Línea de ensamblaje robótica industrial',
      heroFoodBeverage: 'Línea de producción de alimentos y bebidas',
      heroEnergyProcess: 'Planta industrial de energía y procesos',
      automotive: 'Taller de carrocería automotriz con robótica industrial',
      foodBeverage: 'Línea de producción de alimentos y bebidas',
      energyProcess: 'Planta industrial de energía y procesos',
      cosmeticsPackaging: 'Línea de producción de llenado de cosméticos',
      oemGeneral: 'Celda robótica industrial',
      assembly: 'Línea de ensamblaje automatizada de última generación',
    },
    clients: { eyebrow: 'Experiencia seleccionada', logoAlt: 'Logotipo de {name}' },
    capabilities: { explore: 'Explorar capacidad' },
    industries: {
      lead: 'J&A Automation construye, integra y brinda soporte a sistemas de control industrial en múltiples sectores.',
      viewProjects: 'Ver proyectos de esta industria',
    },
    remoteSupport: {
      coverageEyebrow: 'Cobertura presencial + remota',
      coveragePlcHmi: 'PLC / HMI',
      coverageRobotics: 'Robótica',
      coverageDrivesMotion: 'Drives + motion',
      coverageProductionStartup: 'Startup de producción',
    },
    projectFilters: {
      formLabel: 'Filtros de proyectos',
      projectCount: '{shown} / {total} proyectos',
      trainingConsulting: 'Capacitación / consultoría',
    },
    serviceTags: {
      siemens: 'Siemens',
      rockwell: 'Rockwell',
      wincc: 'WinCC',
      factoryTalk: 'FactoryTalk',
      fanuc: 'FANUC',
      kuka: 'KUKA',
      abb: 'ABB',
      yaskawa: 'Yaskawa',
      processSimulate: 'Process Simulate',
      robotStudio: 'RobotStudio',
      offlineEngineering: 'Ingeniería offline',
      eplan: 'EPLAN',
      autoCadElectrical: 'AutoCAD Electrical',
      panels: 'Tableros',
      safetyInterfaces: 'Interfaces de seguridad',
      vfd: 'VFD',
      servo: 'Servo',
      motion: 'Motion',
      pid: 'PID',
      fat: 'FAT',
      sat: 'SAT',
      startup: 'Startup',
      rampUp: 'Ramp-up',
      remoteSupport: 'Soporte remoto',
      troubleshooting: 'Troubleshooting',
      training: 'Capacitación',
      consulting: 'Consultoría',
    },
    serviceOptions: { trainingConsulting: 'Capacitación / consultoría' },
    about: {
      storyP3:
        'Nuestra filosofía es simple: la excelencia en ingeniería impulsa la confiabilidad. Construimos estructuras de código modulares, robustas y diseñadas para las condiciones reales del piso de producción.',
      founded: 'Fundada',
      offices: 'Oficinas (EE.UU. y Brasil)',
      projectsCompleted: 'Proyectos completados',
      standard: 'El estándar J&A',
      modularEngineering: 'Ingeniería modular',
      modularEngineeringBody:
        'Desarrollamos bases de código PLC y HMI con principios orientados a objetos. Las instrucciones estandarizadas Add-On (AOI) aseguran consistencia, reducen el tiempo de diagnóstico y hacen escalables nuestros sistemas.',
      oemIndependent: 'Independientes de OEM',
      oemIndependentBody:
        'Aunque tenemos amplia experiencia en Rockwell, Siemens y KUKA, seguimos siendo independientes del hardware. Diseñamos la mejor solución para sus requisitos técnicos y presupuesto.',
      lifecycleSupport: 'Soporte de ciclo de vida',
      lifecycleSupportBody:
        'La puesta en marcha no es el final. Proporcionamos documentación completa, capacitación de operadores e infraestructura segura de soporte remoto para que su línea opere con el máximo OEE durante décadas.',
      joinTeam: 'Únase a nuestro equipo',
      joinTeamBody:
        'Siempre buscamos ingenieros de PLC, especialistas en robótica y diseñadores eléctricos talentosos para unirse a nuestras operaciones en EE.UU. y Brasil.',
      careerOpportunities: 'Ver oportunidades profesionales',
    },
    aquarex: {
      eyebrow: 'Solución propia',
      subtitle:
        'Sistema de control inteligente para tratamiento de agua industrial y ósmosis inversa.',
      requestDatasheet: 'Solicitar ficha técnica',
      talkToEngineer: 'Hable con un ingeniero',
      systemAdvantages: 'Ventajas del sistema',
      monitoring: 'Monitoreo en tiempo real',
      monitoringBody:
        'Adquisición continua de datos de conductividad, pH, caudal y presión en todas las etapas de tratamiento.',
      architecture: 'Arquitectura estandarizada',
      architectureBody:
        'La base de código PLC/HMI prediseñada reduce hasta un 40% el tiempo de puesta en marcha y mantiene una confiabilidad sólida.',
      compliance: 'Lista para cumplimiento',
      complianceBody:
        'Herramientas integradas de registro y reportes diseñadas para cumplir las estrictas regulaciones de alimentos, bebidas y productos farmacéuticos.',
      processControl: 'Control de procesos estandarizado',
      processBody:
        'La plataforma Aquarex se integra con unidades de ósmosis inversa (RO), ultrafiltración (UF) y sistemas de dosificación química. Proporciona una interfaz HMI unificada y estandariza estructuras de datos para facilitar la integración ERP/MES.',
      skidIntegration: 'Integración de skids',
      skidIntegrationBody: 'Bloques lógicos plug-and-play para skids OEM comunes.',
      chemicalDosing: 'Dosificación química',
      chemicalDosingBody:
        'Control preciso en lazo cerrado de bombas dosificadoras a partir de la retroalimentación de sensores en línea.',
      alarmManagement: 'Gestión de alarmas',
      alarmManagementBody:
        'Estructuras de alarmas conformes con ISA 18.2 para un troubleshooting rápido.',
      diagramAria: 'Diagrama de arquitectura Aquarex',
      diagramCore: 'PLC CENTRAL AQUAREX',
      diagramHmi: 'SCADA / HMI',
      diagramSensors: 'Sensores (pH, cond.)',
      diagramFlowMeters: 'Medidores de caudal',
      diagramDosingPumps: 'Bombas dosificadoras',
      diagramVfdMotors: 'VFD / motores',
      diagramValves: 'Válvulas',
      datasheetHeading: 'Solicitar ficha técnica',
      datasheetBody:
        'Ingrese sus datos para recibir la guía completa de especificación Aquarex, la lista de E/S y los requisitos de integración.',
      firstName: 'Nombre',
      lastName: 'Apellido',
      workEmail: 'Correo corporativo',
      company: 'Empresa',
      sendDatasheet: 'Enviar ficha técnica',
      privacyNote:
        'Al solicitar esta ficha técnica, acepta nuestra política de privacidad. Nunca compartiremos su información.',
    },
    contact: {
      website: 'Sitio web',
      companyRequired: 'Empresa',
      countrySite: 'País / sitio',
      primaryService: 'Servicio principal de interés',
      technologyPlatform: 'Tecnología / plataforma',
      plcRobotPlaceholder: 'PLC, robot, SCADA, controles…',
      emailOption: 'Correo electrónico',
      phoneOption: 'Teléfono',
      siteFacility: 'Sitio / planta',
      plantLocationPlaceholder: 'Ubicación de planta, sitio o sistema',
      affectedSystem: 'Sistema / plataforma afectada',
      plcHmiPlaceholder: 'PLC, robot, HMI, SCADA…',
      urgency: 'Urgencia',
      productionStopped: 'Producción detenida',
      degraded: 'Degradada',
      plannedSupport: 'Soporte planificado',
      location: 'Ubicación',
      professionalProfile: 'Perfil profesional',
      controlsPlaceholder: 'Controles, robótica, electricidad…',
      platformsExperience: 'Plataformas / experiencia',
      experiencePlaceholder: 'PLC, robot, HMI u otra experiencia',
      travelAvailability: 'Disponibilidad para viajar',
      travelYes: 'Sí',
      travelLimited: 'Limitada',
      travelNo: 'No',
      industryAutomotive: 'Automotriz',
      industryFoodBeverage: 'Alimentos y bebidas',
      industryEnergyProcess: 'Energía y procesos',
      industryGeneralManufacturing: 'Manufactura general',
      industryOther: 'Otra / no estoy seguro',
      aquarexWaterTreatment: 'Tratamiento de agua Aquarex',
      otherNotSure: 'Otro / no estoy seguro',
    },
    careers: { workH2: 'Lo que el trabajo puede involucrar' },
    error: {
      tryAgain: 'Intentar de nuevo',
      returnHome: 'Volver al inicio',
      unexpected: 'Ocurrió un error inesperado. Nuestro equipo de ingeniería ha sido notificado.',
    },
    notFound: {
      pageTitle: 'Página no encontrada',
      pageMissingBody:
        'La página que busca pudo haber sido eliminada, cambiado de nombre o no estar disponible temporalmente.',
      returnHome: 'Volver al inicio',
    },
  },
  pt: {
    meta: {
      industriesTitle: 'Indústrias de Automação Industrial | J&A Automation',
      industriesDescription:
        'Explore os setores industriais em que a J&A Automation entrega controles, robótica, integração e comissionamento.',
    },
    nav: {
      mainNavigation: 'Navegação principal',
      languageSelector: 'Seletor de idioma',
      navigationMenu: 'Menu de navegação',
      siteHome: 'Página inicial da J&A Automation',
      logoAlt: 'Logotipo da J&A Automation',
      switchTo: 'Mudar para {language}',
      languageNames: { en: 'inglês', pt: 'português do Brasil', es: 'espanhol' },
      languageLabels: { en: 'EN', pt: 'PT-BR', es: 'ES' },
    },
    common: {
      backToCapabilities: 'Voltar para capacidades',
      backToIndustries: 'Voltar para indústrias',
      backToProjects: 'Voltar para projetos',
      relatedProjectExperience: 'Experiência relacionada em projetos',
      projectExperience: 'Experiência em projetos',
      projectScope: 'Escopo do projeto',
      outcome: 'Resultado',
      capabilitiesApplied: 'Capacidades aplicadas',
      technologies: 'Tecnologias',
      exploreCapability: 'Explorar capacidade',
      viewAllProjects: 'Ver todos os projetos',
      viewProjectsInIndustry: 'Ver projetos desta indústria',
      discussSimilarProject: 'Converse sobre um projeto semelhante',
      contactEngineeringTeam: 'Contatar a equipe de engenharia',
      needEngineeringSupport: 'Precisa de suporte de engenharia para {capability}?',
      needSectorSupport: 'Precisa de suporte de engenharia neste setor?',
      projectsCount: '{shown} / {total} projetos',
      notFound: 'Não encontrado',
      tryAgain: 'Tentar novamente',
      returnHome: 'Voltar ao início',
      pageNotFound: 'Página não encontrada',
      pageMissingBody:
        'A página que você procura pode ter sido removida, renomeada ou estar temporariamente indisponível.',
      loading: 'Carregando…',
    },
    imageAlts: {
      logo: 'Soluções industriais da J&A Automation',
      heroRobotics: 'Linha de montagem robótica industrial',
      heroFoodBeverage: 'Linha de produção de alimentos e bebidas',
      heroEnergyProcess: 'Planta industrial de energia e processos',
      automotive: 'Funilaria automotiva industrial com robôs',
      foodBeverage: 'Linha de produção de alimentos e bebidas',
      energyProcess: 'Planta industrial de energia e processos',
      cosmeticsPackaging: 'Linha de produção de envase de cosméticos',
      oemGeneral: 'Célula robótica industrial',
      assembly: 'Linha de montagem automatizada de última geração',
    },
    clients: { eyebrow: 'Experiência selecionada', logoAlt: 'Logotipo de {name}' },
    capabilities: { explore: 'Explorar capacidade' },
    industries: {
      lead: 'A J&A Automation constrói, integra e oferece suporte a sistemas de controle industrial em diversos setores.',
      viewProjects: 'Ver projetos desta indústria',
    },
    remoteSupport: {
      coverageEyebrow: 'Cobertura em campo + remota',
      coveragePlcHmi: 'PLC / IHM',
      coverageRobotics: 'Robótica',
      coverageDrivesMotion: 'Drives + motion',
      coverageProductionStartup: 'Startup de produção',
    },
    projectFilters: {
      formLabel: 'Filtros de projetos',
      projectCount: '{shown} / {total} projetos',
      trainingConsulting: 'Treinamento / consultoria',
    },
    serviceTags: {
      siemens: 'Siemens',
      rockwell: 'Rockwell',
      wincc: 'WinCC',
      factoryTalk: 'FactoryTalk',
      fanuc: 'FANUC',
      kuka: 'KUKA',
      abb: 'ABB',
      yaskawa: 'Yaskawa',
      processSimulate: 'Process Simulate',
      robotStudio: 'RobotStudio',
      offlineEngineering: 'Engenharia offline',
      eplan: 'EPLAN',
      autoCadElectrical: 'AutoCAD Electrical',
      panels: 'Painéis',
      safetyInterfaces: 'Interfaces de segurança',
      vfd: 'VFD',
      servo: 'Servo',
      motion: 'Motion',
      pid: 'PID',
      fat: 'FAT',
      sat: 'SAT',
      startup: 'Startup',
      rampUp: 'Ramp-up',
      remoteSupport: 'Suporte remoto',
      troubleshooting: 'Troubleshooting',
      training: 'Treinamento',
      consulting: 'Consultoria',
    },
    serviceOptions: { trainingConsulting: 'Treinamento / consultoria' },
    about: {
      storyP3:
        'Nossa filosofia é simples: a excelência em engenharia impulsiona a confiabilidade. Construímos estruturas de código modulares, robustas e projetadas para as condições reais do chão de fábrica.',
      founded: 'Fundada',
      offices: 'Escritórios (EUA e Brasil)',
      projectsCompleted: 'Projetos concluídos',
      standard: 'O padrão J&A',
      modularEngineering: 'Engenharia modular',
      modularEngineeringBody:
        'Desenvolvemos bases de código PLC e IHM usando princípios orientados a objetos. Instruções Add-On (AOIs) padronizadas garantem consistência, reduzem o tempo de depuração e tornam nossos sistemas escaláveis.',
      oemIndependent: 'Independente de OEM',
      oemIndependentBody:
        'Embora tenhamos profunda experiência em Rockwell, Siemens e KUKA, permanecemos independentes de hardware. Projetamos a melhor solução para seus requisitos técnicos e orçamento.',
      lifecycleSupport: 'Suporte durante todo o ciclo de vida',
      lifecycleSupportBody:
        'O comissionamento não é o fim. Oferecemos documentação completa, treinamento de operadores e infraestrutura segura de suporte remoto para que sua linha opere com OEE máximo por décadas.',
      joinTeam: 'Faça parte da nossa equipe',
      joinTeamBody:
        'Estamos sempre procurando engenheiros de PLC, especialistas em robótica e projetistas elétricos talentosos para integrar nossas operações nos EUA e no Brasil.',
      careerOpportunities: 'Ver oportunidades de carreira',
    },
    aquarex: {
      eyebrow: 'Solução proprietária',
      subtitle:
        'Sistema de controle inteligente para tratamento de água industrial e osmose reversa.',
      requestDatasheet: 'Solicitar ficha técnica',
      talkToEngineer: 'Fale com um engenheiro',
      systemAdvantages: 'Vantagens do sistema',
      monitoring: 'Monitoramento em tempo real',
      monitoringBody:
        'Aquisição contínua de dados de condutividade, pH, vazão e pressão em todas as etapas de tratamento.',
      architecture: 'Arquitetura padronizada',
      architectureBody:
        'A base de código PLC/IHM pré-projetada reduz o tempo de comissionamento em até 40% e garante alta confiabilidade.',
      compliance: 'Pronta para conformidade',
      complianceBody:
        'Ferramentas integradas de registro e relatórios projetadas para atender às rigorosas regulamentações de alimentos, bebidas e produtos farmacêuticos.',
      processControl: 'Controle de processo padronizado',
      processBody:
        'A plataforma Aquarex integra-se perfeitamente a unidades de osmose reversa (RO), ultrafiltração (UF) e sistemas de dosagem química. Ela fornece uma interface IHM unificada e padroniza estruturas de dados para facilitar a integração ERP/MES.',
      skidIntegration: 'Integração de skids',
      skidIntegrationBody: 'Blocos lógicos plug-and-play para skids OEM comuns.',
      chemicalDosing: 'Dosagem química',
      chemicalDosingBody:
        'Controle preciso em malha fechada das bombas dosadoras com base no retorno dos sensores em linha.',
      alarmManagement: 'Gestão de alarmes',
      alarmManagementBody:
        'Estruturas de alarmes em conformidade com a ISA 18.2 para troubleshooting rápido.',
      diagramAria: 'Diagrama de arquitetura Aquarex',
      diagramCore: 'PLC CENTRAL AQUAREX',
      diagramHmi: 'SCADA / IHM',
      diagramSensors: 'Sensores (pH, cond.)',
      diagramFlowMeters: 'Medidores de vazão',
      diagramDosingPumps: 'Bombas dosadoras',
      diagramVfdMotors: 'VFD / motores',
      diagramValves: 'Válvulas',
      datasheetHeading: 'Solicitar ficha técnica',
      datasheetBody:
        'Informe seus dados para receber o guia completo de especificação Aquarex, a lista de E/S e os requisitos de integração.',
      firstName: 'Nome',
      lastName: 'Sobrenome',
      workEmail: 'E-mail corporativo',
      company: 'Empresa',
      sendDatasheet: 'Enviar ficha técnica',
      privacyNote:
        'Ao solicitar esta ficha técnica, você concorda com nossa política de privacidade. Nunca compartilharemos suas informações.',
    },
    contact: {
      website: 'Site',
      companyRequired: 'Empresa',
      countrySite: 'País / site',
      primaryService: 'Principal serviço de interesse',
      technologyPlatform: 'Tecnologia / plataforma',
      plcRobotPlaceholder: 'PLC, robô, SCADA, controles…',
      emailOption: 'E-mail',
      phoneOption: 'Telefone',
      siteFacility: 'Site / planta',
      plantLocationPlaceholder: 'Localização da planta, site ou sistema',
      affectedSystem: 'Sistema / plataforma afetado',
      plcHmiPlaceholder: 'PLC, robô, IHM, SCADA…',
      urgency: 'Urgência',
      productionStopped: 'Produção parada',
      degraded: 'Degradada',
      plannedSupport: 'Suporte planejado',
      location: 'Localização',
      professionalProfile: 'Perfil profissional',
      controlsPlaceholder: 'Controles, robótica, elétrica…',
      platformsExperience: 'Plataformas / experiência',
      experiencePlaceholder: 'PLC, robô, IHM ou outra experiência',
      travelAvailability: 'Disponibilidade para viagens',
      travelYes: 'Sim',
      travelLimited: 'Limitada',
      travelNo: 'Não',
      industryAutomotive: 'Automotivo',
      industryFoodBeverage: 'Alimentos e bebidas',
      industryEnergyProcess: 'Energia e processos',
      industryGeneralManufacturing: 'Manufatura geral',
      industryOther: 'Outra / não sei',
      aquarexWaterTreatment: 'Tratamento de água Aquarex',
      otherNotSure: 'Outro / não sei',
    },
    careers: { workH2: 'O que o trabalho pode envolver' },
    error: {
      tryAgain: 'Tentar novamente',
      returnHome: 'Voltar ao início',
      unexpected: 'Ocorreu um erro inesperado. Nossa equipe de engenharia foi notificada.',
    },
    notFound: {
      pageTitle: 'Página não encontrada',
      pageMissingBody:
        'A página que você procura pode ter sido removida, renomeada ou estar temporariamente indisponível.',
      returnHome: 'Voltar ao início',
    },
  },
};

const execFileAsync = promisify(execFile);

function deepMerge(
  base: Record<string, unknown>,
  addition: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };

  for (const [key, value] of Object.entries(addition)) {
    const current = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      result[key] = deepMerge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

const localeOverrides = {
  es: {
    meta: {
      homeDescription:
        'Automatización industrial e ingeniería de controles para PLC/HMI/SCADA, robótica, controles eléctricos, simulación, puesta en marcha, diagnóstico de fallas y soporte.',
      capabilitiesDescription:
        'Programación de PLC y HMI, integración robótica, controles eléctricos, simulación, movimiento, puesta en marcha, soporte técnico, modernización y capacitación.',
      industriesTitle: 'Industrias de automatización industrial | J&A Automation',
      industriesDescription:
        'Explore los sectores industriales donde J&A Automation ofrece controles, robótica, integración y puesta en marcha.',
    },
    hero: {
      body: 'J&A Automation diseña, integra, pone en marcha y da soporte a sistemas de control industrial en todo el mundo — desde PLC, HMI y SCADA hasta robótica, ingeniería eléctrica, simulación, arranque y diagnóstico de fallas.',
    },
    intro: {
      p1: 'Los proyectos de automatización industrial rara vez fallan dentro de una sola disciplina. La lógica de PLC, los robots, los accionamientos, las interfaces de seguridad, el diseño eléctrico, la mecánica, los operadores y los programas de producción tienen que funcionar juntos. J&A Automation integra esas interfaces en un solo alcance de ingeniería.',
      p2: 'Desde nuevos sistemas y actualizaciones de línea hasta puesta en marcha, diagnóstico de fallas y soporte remoto, nuestro equipo trabaja en todo el ciclo de vida de la automatización con enfoque práctico en lo que debe funcionar en el piso de producción.',
    },
    capabilities: {
      roboticsDesc:
        'Programación de robots, enlaces PLC/robot, coordinación de celdas, interbloqueos, transportadores, lógica de producción e integración a nivel de línea.',
      simulation: 'Simulación e ingeniería sin conexión',
      simulationDesc:
        'Valide diseños, comportamiento de proceso, trayectorias de robots e interfaces de control antes o junto al despliegue en campo.',
      motionProcess: 'Movimiento y control de procesos',
      motionProcessDesc:
        'VFD, servo, movimiento y control en lazo cerrado para transportadores, sistemas de llenado, máquinas y equipos de proceso industrial.',
      commissioning: 'Puesta en marcha y arranque',
      commissioningDesc:
        'Soporte FAT/SAT, integración en campo, arranque, aumento gradual de producción, diagnóstico de fallas y estabilización de la producción.',
      explore: 'Explorar capacidad',
    },
    industries: {
      automotiveDesc:
        'Taller de carrocería, ensamble, estampado, tren motriz, transportadores, poka-yoke, integración robot/PLC y puesta en marcha.',
      cosmeticsPackagingDesc:
        'Llenado, tapado, indexación, movimiento, toma y colocación, transporte, encartuchado e integración de máquinas.',
      oemGeneralDesc:
        'Ingeniería de controles, integración de máquinas, modernizaciones, tableros y puesta en marcha para OEMs y fabricantes industriales.',
      lead: 'J&A Automation construye, integra y brinda soporte a sistemas de control industrial en múltiples sectores.',
      viewProjects: 'Ver proyectos de esta industria',
    },
    techEcosystem: {
      h2: 'Experiencia con múltiples proveedores para los sistemas que ya están en su piso de producción.',
      lead: 'Las plantas industriales rara vez operan en una sola plataforma. Los ingenieros de J&A trabajan con ecosistemas de control, robótica, HMI, movimiento e ingeniería establecidos y modernos — apoyando tanto proyectos nuevos como equipos instalados.',
      motion: 'Movimiento / Campo',
    },
    delivery: {
      step4Desc:
        'Integrar en sitio, resolver problemas de interfaz, ejecutar actividades de arranque/SAT y estabilizar el comportamiento de producción.',
      step5Desc:
        'Proporcionar mejoras dirigidas, soporte técnico, capacitación y diagnóstico remoto después de la entrega.',
    },
    remoteSupport: {
      body: 'J&A proporciona soporte técnico para problemas de PLC, HMI, robot y controles industriales bajo demanda o por contrato. El diagnóstico remoto puede acelerar la resolución de fallas cuando el problema puede investigarse a través del ambiente de controles instalado; el soporte presencial sigue disponible cuando el trabajo requiere el piso de producción.',
      coverageEyebrow: 'Cobertura presencial + remota',
      coveragePlcHmi: 'PLC / HMI',
      coverageRobotics: 'Robótica',
      coverageDrivesMotion: 'Variadores + movimiento',
      coverageProductionStartup: 'Arranque de producción',
    },
    team: {
      body: 'El equipo combina experiencia internacional en proyectos, gestión de proyectos, capacitación de fabricantes y trabajo práctico en ambientes de taller de carrocería, pintura, ensamble, estampado y tren motriz automotriz.',
    },
    contact: {
      primaryTitle: 'Director ejecutivo',
      website: 'Sitio web',
      companyRequired: 'Empresa',
      countrySite: 'País / sitio',
      primaryService: 'Servicio principal de interés',
      technologyPlatform: 'Tecnología / plataforma',
      plcRobotPlaceholder: 'PLC, robot, SCADA, controles…',
      emailOption: 'Correo electrónico',
      phoneOption: 'Teléfono',
      siteFacility: 'Sitio / planta',
      plantLocationPlaceholder: 'Ubicación de planta, sitio o sistema',
      affectedSystem: 'Sistema / plataforma afectada',
      plcHmiPlaceholder: 'PLC, robot, HMI, SCADA…',
      urgency: 'Urgencia',
      degraded: 'Degradada',
      plannedSupport: 'Soporte planificado',
      location: 'Ubicación',
      professionalProfile: 'Perfil profesional',
      controlsPlaceholder: 'Controles, robótica, electricidad…',
      platformsExperience: 'Plataformas / experiencia',
      experiencePlaceholder: 'PLC, robot, HMI u otra experiencia',
      travelAvailability: 'Disponibilidad para viajar',
      travelYes: 'Sí',
      travelLimited: 'Limitada',
      travelNo: 'No',
      industryAutomotive: 'Automotriz',
      industryFoodBeverage: 'Alimentos y bebidas',
      industryEnergyProcess: 'Energía y procesos',
      industryGeneralManufacturing: 'Manufactura general',
      industryOther: 'Otra / no estoy seguro',
      aquarexWaterTreatment: 'Tratamiento de agua Aquarex',
      otherNotSure: 'Otro / no estoy seguro',
      supportHelper:
        'Diagnóstico de fallas, equipo instalado, problema de producción, soporte PLC/HMI/robot, arranque o asistencia de mantenimiento.',
    },
    about: {
      storyP1:
        'Los proyectos industriales se juzgan en el piso de producción. El software tiene que funcionar con hardware eléctrico, robots, accionamientos, mecánica, operadores, equipos de mantenimiento y programas de producción. La historia de proyectos de J&A refleja ese enfoque práctico — desde modificaciones de máquinas y desarrollo de controles hasta integración de líneas, puesta en marcha, aumento gradual de producción y soporte continuo.',
      storyP3:
        'Nuestra filosofía es simple: la excelencia en ingeniería impulsa la confiabilidad. Construimos estructuras de código modulares, robustas y diseñadas para las condiciones reales del piso de producción.',
      founded: 'Fundada',
      offices: 'Oficinas (EE.UU. y Brasil)',
      projectsCompleted: 'Proyectos completados',
      standard: 'El estándar J&A',
      modularEngineering: 'Ingeniería modular',
      modularEngineeringBody:
        'Desarrollamos bases de código PLC y HMI con principios orientados a objetos. Las instrucciones estandarizadas Add-On (AOI) aseguran consistencia, reducen el tiempo de diagnóstico y hacen escalables nuestros sistemas.',
      oemIndependent: 'Independientes de OEM',
      oemIndependentBody:
        'Aunque tenemos amplia experiencia en Rockwell, Siemens y KUKA, seguimos siendo independientes del hardware. Diseñamos la mejor solución para sus requisitos técnicos y presupuesto.',
      lifecycleSupport: 'Soporte de ciclo de vida',
      lifecycleSupportBody:
        'La puesta en marcha no es el final. Proporcionamos documentación completa, capacitación de operadores e infraestructura segura de soporte remoto para que su línea opere con el máximo OEE durante décadas.',
      joinTeam: 'Únase a nuestro equipo',
      joinTeamBody:
        'Siempre buscamos ingenieros de PLC, especialistas en robótica y diseñadores eléctricos talentosos para unirse a nuestras operaciones en EE.UU. y Brasil.',
      careerOpportunities: 'Ver oportunidades profesionales',
      principle3Title: 'Permanecer hasta el arranque',
      lead: 'J&A Automation trabaja en controles PLC, robótica, ingeniería eléctrica, simulación, puesta en marcha y diagnóstico de fallas industriales. Buscamos ingenieros y técnicos que combinen profundidad técnica con resolución práctica de problemas en ambientes de producción.',
    },
    projectFilters: {
      formLabel: 'Filtros de proyectos',
      projectCount: '{shown} / {total} proyectos',
      trainingConsulting: 'Capacitación / consultoría',
      motion: 'Movimiento',
      troubleshooting: 'Diagnóstico de fallas',
    },
    serviceTags: {
      siemens: 'Siemens',
      rockwell: 'Rockwell',
      wincc: 'WinCC',
      factoryTalk: 'FactoryTalk',
      fanuc: 'FANUC',
      kuka: 'KUKA',
      abb: 'ABB',
      yaskawa: 'Yaskawa',
      processSimulate: 'Process Simulate',
      robotStudio: 'RobotStudio',
      offlineEngineering: 'Ingeniería sin conexión',
      eplan: 'EPLAN',
      autoCadElectrical: 'AutoCAD Electrical',
      panels: 'Tableros',
      safetyInterfaces: 'Interfaces de seguridad',
      vfd: 'VFD',
      servo: 'Servo',
      motion: 'Movimiento',
      pid: 'PID',
      fat: 'FAT',
      sat: 'SAT',
      startup: 'Arranque',
      rampUp: 'Aumento gradual de producción',
      remoteSupport: 'Soporte remoto',
      troubleshooting: 'Diagnóstico de fallas',
      training: 'Capacitación',
      consulting: 'Consultoría',
    },
    aquarex: {
      eyebrow: 'Solución propia',
      subtitle:
        'Sistema de control inteligente para tratamiento de agua industrial y ósmosis inversa.',
      requestDatasheet: 'Solicitar ficha técnica',
      talkToEngineer: 'Hable con un ingeniero',
      systemAdvantages: 'Ventajas del sistema',
      monitoring: 'Monitoreo en tiempo real',
      monitoringBody:
        'Adquisición continua de datos de conductividad, pH, caudal y presión en todas las etapas de tratamiento.',
      architecture: 'Arquitectura estandarizada',
      architectureBody:
        'La base de código PLC/HMI prediseñada reduce hasta un 40 % el tiempo de puesta en marcha y mantiene una confiabilidad sólida.',
      compliance: 'Lista para cumplimiento',
      complianceBody:
        'Herramientas integradas de registro y reportes diseñadas para cumplir las estrictas regulaciones de alimentos, bebidas y productos farmacéuticos.',
      processControl: 'Control de procesos estandarizado',
      processBody:
        'La plataforma Aquarex se integra con unidades de ósmosis inversa (RO), ultrafiltración (UF) y sistemas de dosificación química. Proporciona una interfaz HMI unificada y estandariza estructuras de datos para facilitar la integración ERP/MES.',
      skidIntegration: 'Integración de skids',
      skidIntegrationBody: 'Bloques lógicos plug-and-play para skids OEM comunes.',
      chemicalDosing: 'Dosificación química',
      chemicalDosingBody:
        'Control preciso en lazo cerrado de bombas dosificadoras a partir de la retroalimentación de sensores en línea.',
      alarmManagement: 'Gestión de alarmas',
      alarmManagementBody:
        'Estructuras de alarmas conformes con ISA 18.2 para un diagnóstico rápido de fallas.',
      diagramAria: 'Diagrama de arquitectura Aquarex',
      diagramCore: 'PLC CENTRAL AQUAREX',
      diagramHmi: 'SCADA / HMI',
      diagramSensors: 'Sensores (pH, cond.)',
      diagramFlowMeters: 'Medidores de caudal',
      diagramDosingPumps: 'Bombas dosificadoras',
      diagramVfdMotors: 'VFD / motores',
      diagramValves: 'Válvulas',
      datasheetHeading: 'Solicitar ficha técnica',
      datasheetBody:
        'Ingrese sus datos para recibir la guía completa de especificación Aquarex, la lista de E/S y los requisitos de integración.',
      firstName: 'Nombre',
      lastName: 'Apellido',
      workEmail: 'Correo corporativo',
      company: 'Empresa',
      sendDatasheet: 'Enviar ficha técnica',
      privacyNote:
        'Al solicitar esta ficha técnica, acepta nuestra política de privacidad. Nunca compartiremos su información.',
    },
  },
  pt: {
    meta: {
      homeDescription:
        'Automação industrial e engenharia de controles para CLP/IHM/SCADA, robótica, controles elétricos, simulação, comissionamento, diagnóstico de falhas e suporte.',
      capabilitiesDescription:
        'Programação de CLP e IHM, integração robótica, controles elétricos, simulação, movimento, comissionamento, suporte técnico, modernização e treinamento.',
      industriesTitle: 'Indústrias de automação industrial | J&A Automation',
      industriesDescription:
        'Explore os setores industriais em que a J&A Automation entrega controles, robótica, integração e comissionamento.',
    },
    hero: {
      body: 'A J&A Automation projeta, integra, comissiona e dá suporte a sistemas de controle industrial no mundo todo — de CLP, IHM e SCADA a robótica, engenharia elétrica, simulação, partida e diagnóstico de falhas.',
    },
    intro: {
      p1: 'Projetos de automação industrial raramente falham dentro de uma única disciplina. A lógica de CLP, os robôs, os acionamentos, as interfaces de segurança, o projeto elétrico, a mecânica, os operadores e os cronogramas de produção precisam funcionar juntos. A J&A Automation integra essas interfaces em um único escopo de engenharia.',
      p2: 'De novos sistemas e atualizações de linha a comissionamento, diagnóstico de falhas e suporte remoto, nossa equipe trabalha em todo o ciclo de vida da automação com foco prático no que precisa funcionar no chão de fábrica.',
    },
    capabilities: {
      roboticsDesc:
        'Programação de robôs, enlaces CLP/robô, coordenação de células, intertravamentos, transportadores, lógica de produção e integração em nível de linha.',
      simulation: 'Simulação e engenharia off-line',
      simulationDesc:
        'Valide projetos, comportamento de processo, trajetórias de robôs e interfaces de controle antes ou junto da implantação em campo.',
      motionProcess: 'Movimento e controle de processos',
      motionProcessDesc:
        'VFD, servo, movimento e controle em malha fechada para transportadores, sistemas de envase, máquinas e equipamentos de processo industrial.',
      commissioning: 'Comissionamento e partida',
      commissioningDesc:
        'Suporte FAT/SAT, integração em campo, partida, aumento gradual da produção, diagnóstico de falhas e estabilização da produção.',
      explore: 'Explorar capacidade',
    },
    industries: {
      automotiveDesc:
        'Funilaria, montagem, estamparia, powertrain, transportadores, poka-yoke, integração robô/CLP e comissionamento.',
      foodBeverageDesc:
        'Envase, transporte, embalagem, receitas, trocas de formato, atualizações, trabalho de eficiência e comissionamento de linha.',
      cosmeticsPackagingDesc:
        'Envase, tampamento, indexação, movimento, pega e coloca, transporte, encartuchamento e integração de máquinas.',
      oemGeneralDesc:
        'Engenharia de controles, integração de máquinas, modernizações, painéis e comissionamento para OEMs e fabricantes industriais.',
      lead: 'A J&A Automation constrói, integra e oferece suporte a sistemas de controle industrial em diversos setores.',
      viewProjects: 'Ver projetos desta indústria',
    },
    techEcosystem: {
      h2: 'Experiência com vários fornecedores para os sistemas que já estão no seu chão de fábrica.',
      lead: 'Plantas industriais raramente operam em uma única plataforma. Os engenheiros da J&A trabalham com ecossistemas de controle, robótica, IHM, movimento e engenharia estabelecidos e modernos — apoiando tanto projetos novos quanto equipamentos instalados.',
      motion: 'Movimento / Campo',
    },
    delivery: {
      step4Desc:
        'Integrar no campo, resolver problemas de interface, executar atividades de partida/SAT e estabilizar o comportamento da produção.',
      step5Desc:
        'Fornecer melhorias direcionadas, suporte técnico, treinamento e diagnóstico remoto após a entrega.',
    },
    remoteSupport: {
      body: 'A J&A oferece suporte técnico para problemas de CLP, IHM, robô e controles industriais sob demanda ou por contrato. O diagnóstico remoto pode acelerar a resolução de falhas quando o problema pode ser investigado através do ambiente de controles instalado; o suporte presencial continua disponível quando o trabalho exige acesso ao chão de fábrica.',
      coverageEyebrow: 'Cobertura em campo + remota',
      coveragePlcHmi: 'CLP / IHM',
      coverageRobotics: 'Robótica',
      coverageDrivesMotion: 'Acionamentos + movimento',
      coverageProductionStartup: 'Partida da produção',
    },
    team: {
      body: 'A equipe combina experiência internacional em projetos, gestão de projetos, treinamento de fabricantes e trabalho prático em ambientes de funilaria, pintura, montagem, estamparia e powertrain automotivo.',
    },
    contact: {
      primaryTitle: 'Diretor executivo',
      website: 'Site',
      companyRequired: 'Empresa',
      countrySite: 'País / site',
      primaryService: 'Principal serviço de interesse',
      technologyPlatform: 'Tecnologia / plataforma',
      plcRobotPlaceholder: 'CLP, robô, SCADA, controles…',
      emailOption: 'E-mail',
      phoneOption: 'Telefone',
      siteFacility: 'Site / planta',
      plantLocationPlaceholder: 'Localização da planta, site ou sistema',
      affectedSystem: 'Sistema / plataforma afetado',
      plcHmiPlaceholder: 'CLP, robô, IHM, SCADA…',
      urgency: 'Urgência',
      degraded: 'Degradada',
      plannedSupport: 'Suporte planejado',
      location: 'Localização',
      professionalProfile: 'Perfil profissional',
      controlsPlaceholder: 'Controles, robótica, elétrica…',
      platformsExperience: 'Plataformas / experiência',
      experiencePlaceholder: 'CLP, robô, IHM ou outra experiência',
      travelAvailability: 'Disponibilidade para viagens',
      travelYes: 'Sim',
      travelLimited: 'Limitada',
      travelNo: 'Não',
      industryAutomotive: 'Automotivo',
      industryFoodBeverage: 'Alimentos e bebidas',
      industryEnergyProcess: 'Energia e processos',
      industryGeneralManufacturing: 'Manufatura geral',
      industryOther: 'Outra / não tenho certeza',
      aquarexWaterTreatment: 'Tratamento de água Aquarex',
      otherNotSure: 'Outro / não tenho certeza',
      supportHelper:
        'Diagnóstico de falhas, equipamento instalado, problema de produção, suporte CLP/IHM/robô, partida ou assistência de manutenção.',
    },
    about: {
      storyP1:
        'Projetos industriais são julgados no chão de fábrica. O software tem que funcionar com hardware elétrico, robôs, acionamentos, mecânica, operadores, equipes de manutenção e cronogramas de produção. O histórico de projetos da J&A reflete esse foco prático — de modificações de máquinas e desenvolvimento de controles a integração de linhas, comissionamento, aumento gradual da produção e suporte contínuo.',
      storyP3:
        'Nossa filosofia é simples: a excelência em engenharia impulsiona a confiabilidade. Construímos estruturas de código modulares, robustas e projetadas para as condições reais do chão de fábrica.',
      founded: 'Fundada',
      offices: 'Escritórios (EUA e Brasil)',
      projectsCompleted: 'Projetos concluídos',
      standard: 'O padrão J&A',
      modularEngineering: 'Engenharia modular',
      modularEngineeringBody:
        'Desenvolvemos bases de código CLP e IHM usando princípios orientados a objetos. Instruções Add-On (AOIs) padronizadas garantem consistência, reduzem o tempo de depuração e tornam nossos sistemas escaláveis.',
      oemIndependent: 'Independente de OEM',
      oemIndependentBody:
        'Embora tenhamos profunda experiência em Rockwell, Siemens e KUKA, permanecemos independentes de hardware. Projetamos a melhor solução para seus requisitos técnicos e orçamento.',
      lifecycleSupport: 'Suporte durante todo o ciclo de vida',
      lifecycleSupportBody:
        'O comissionamento não é o fim. Oferecemos documentação completa, treinamento de operadores e infraestrutura segura de suporte remoto para que sua linha opere com OEE máximo por décadas.',
      joinTeam: 'Faça parte da nossa equipe',
      joinTeamBody:
        'Estamos sempre procurando engenheiros de CLP, especialistas em robótica e projetistas elétricos talentosos para integrar nossas operações nos EUA e no Brasil.',
      careerOpportunities: 'Ver oportunidades de carreira',
      principle3Title: 'Permanecer até a partida',
      lead: 'A J&A Automation atua em controles CLP, robótica, engenharia elétrica, simulação, comissionamento e diagnóstico de falhas industriais. Buscamos engenheiros e técnicos que combinem profundidade técnica com resolução prática de problemas em ambientes de produção.',
    },
    projectFilters: {
      formLabel: 'Filtros de projetos',
      projectCount: '{shown} / {total} projetos',
      trainingConsulting: 'Treinamento / consultoria',
      motion: 'Movimento',
      troubleshooting: 'Diagnóstico de falhas',
    },
    serviceTags: {
      siemens: 'Siemens',
      rockwell: 'Rockwell',
      wincc: 'WinCC',
      factoryTalk: 'FactoryTalk',
      fanuc: 'FANUC',
      kuka: 'KUKA',
      abb: 'ABB',
      yaskawa: 'Yaskawa',
      processSimulate: 'Process Simulate',
      robotStudio: 'RobotStudio',
      offlineEngineering: 'Engenharia off-line',
      eplan: 'EPLAN',
      autoCadElectrical: 'AutoCAD Electrical',
      panels: 'Painéis',
      safetyInterfaces: 'Interfaces de segurança',
      vfd: 'VFD',
      servo: 'Servo',
      motion: 'Movimento',
      pid: 'PID',
      fat: 'FAT',
      sat: 'SAT',
      startup: 'Partida',
      rampUp: 'Aumento gradual da produção',
      remoteSupport: 'Suporte remoto',
      troubleshooting: 'Diagnóstico de falhas',
      training: 'Treinamento',
      consulting: 'Consultoria',
    },
    aquarex: {
      eyebrow: 'Solução proprietária',
      subtitle:
        'Sistema de controle inteligente para tratamento de água industrial e osmose reversa.',
      requestDatasheet: 'Solicitar ficha técnica',
      talkToEngineer: 'Fale com um engenheiro',
      systemAdvantages: 'Vantagens do sistema',
      monitoring: 'Monitoramento em tempo real',
      monitoringBody:
        'Aquisição contínua de dados de condutividade, pH, vazão e pressão em todas as etapas de tratamento.',
      architecture: 'Arquitetura padronizada',
      architectureBody:
        'A base de código PLC/IHM pré-projetada reduz o tempo de comissionamento em até 40% e garante alta confiabilidade.',
      compliance: 'Pronta para conformidade',
      complianceBody:
        'Ferramentas integradas de registro e relatórios projetadas para atender às rigorosas regulamentações de alimentos, bebidas e produtos farmacêuticos.',
      processControl: 'Controle de processo padronizado',
      processBody:
        'A plataforma Aquarex integra-se a unidades de osmose reversa (RO), ultrafiltração (UF) e sistemas de dosagem química. Ela fornece uma interface IHM unificada e padroniza estruturas de dados para facilitar a integração ERP/MES.',
      skidIntegration: 'Integração de skids',
      skidIntegrationBody: 'Blocos lógicos plug-and-play para skids OEM comuns.',
      chemicalDosing: 'Dosagem química',
      chemicalDosingBody:
        'Controle preciso em malha fechada das bombas dosadoras com base no retorno dos sensores em linha.',
      alarmManagement: 'Gestão de alarmes',
      alarmManagementBody:
        'Estruturas de alarmes em conformidade com a ISA 18.2 para diagnóstico rápido de falhas.',
      diagramAria: 'Diagrama de arquitetura Aquarex',
      diagramCore: 'CLP CENTRAL AQUAREX',
      diagramHmi: 'SCADA / IHM',
      diagramSensors: 'Sensores (pH, cond.)',
      diagramFlowMeters: 'Medidores de vazão',
      diagramDosingPumps: 'Bombas dosadoras',
      diagramVfdMotors: 'VFD / motores',
      diagramValves: 'Válvulas',
      datasheetHeading: 'Solicitar ficha técnica',
      datasheetBody:
        'Informe seus dados para receber o guia completo de especificação Aquarex, a lista de E/S e os requisitos de integração.',
      firstName: 'Nome',
      lastName: 'Sobrenome',
      workEmail: 'E-mail corporativo',
      company: 'Empresa',
      sendDatasheet: 'Enviar ficha técnica',
      privacyNote:
        'Ao solicitar esta ficha técnica, você concorda com nossa política de privacidade. Nunca compartilharemos suas informações.',
    },
  },
} as const;

for (const locale of ['en', 'es', 'pt'] as const) {
  const path = new URL(`../website/content/locales/${locale}.json`, import.meta.url);
  const { stdout } = await execFileAsync(
    'git',
    ['show', `HEAD:website/content/locales/${locale}.json`],
    { cwd: fileURLToPath(new URL('../', import.meta.url)) },
  );
  const existing = JSON.parse(stdout) as Record<string, unknown>;
  const localeAddition = additions[locale];
  const projectCatalog = Object.fromEntries(
    projects.map((project) => {
      const copy =
        locale === 'en'
          ? {
              title: project.title,
              scope: project.scope,
              outcome: project.outcome ?? '',
              displayDate: project.displayDate ?? '',
            }
          : {
              ...projectCopies[project.id][locale],
              outcome: projectCopies[project.id][locale].outcome ?? '',
            };
      return [project.id, copy];
    }),
  );

  const merged = deepMerge(existing, {
    ...localeAddition,
    ...(localeOverrides[locale] ?? {}),
    projectCatalog,
  });
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}
