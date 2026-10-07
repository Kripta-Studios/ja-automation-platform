import Fuse from 'fuse.js';
import { assistantTasks, tasksForContext } from './catalog';
import type {
  AssistantContext,
  AssistantLocale,
  AssistantSearchResult,
  AssistantTask,
} from './types';

/** Ranking scores describe textual relevance, never confidence or authorization. */
export function normalizeAssistantText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const wordGroups: Record<string, string> = {
  project: 'project projects proyecto proyectos projeto projetos',
  client: 'client clients customer customers cliente clientes',
  team: 'team teams worker workers trabajador trabajadores trabalhador trabalhadores invitation invitacion convite member members specialist specialists equipo equipa equipe especialistas miembro membros',
  user: 'user users account accounts usuario usuarios utilizador utilizadores cuenta cuentas conta contas',
  mailbox: 'mailbox mailboxes email emails buzones buzon correo correio caixa caixas',
  supplier: 'supplier suppliers proveedor proveedores fornecedor fornecedores',
  crew: 'crew chief jefe delegado delegada chefe tripulacao',
  time: 'time hours hour timesheet timesheets tiempo horas hora partes tempo',
  expense: 'expense expenses receipt receipts gasto gastos despesa despesas recibo recibos',
  report: 'report reports informe informes relatorio relatorios',
  approval:
    'approval approvals approve approved aprobar aprobado aprobacion aprovar aprovado aprovacao',
  finance:
    'finance financial economic forecast budgets budget commercial financiero financiera financiero financiero economia economico economica previsao presupuesto presupuestos orcamento orcamentos comercial',
  compensation:
    'compensation salary salaries wage wages remuneracion remuneracao sueldo salario settlement settlements liquidar liquidacion liquidacao',
  labor: 'labor labour rate rates tarifa tarifas mao obra',
  cost: 'cost costs coste costes costo costos custo custos loaded',
  billing: 'billing bill facturacion faturacao stream streams flujo flujos fluxo fluxos',
  invoice: 'invoice invoices factura facturas fatura faturas',
  tax: 'tax taxes fiscal fiscales fiscais impuesto impuestos',
  ledger: 'ledger collection collections cobro cobros cobranças cobrancas cobranza razao mayor',
  accounting:
    'accounting contable contables contabilidade contabilistico pack packs paquete paquetes pacote pacotes',
  pay: 'pay payment payments pagar pago pagos pagamento pagamentos reimbursement reimbursements reembolso reembolsos',
  document:
    'document documents file files artifact artifacts documento documentos archivo archivos ficheiro ficheiros',
  planning: 'planning plan schedule calendar planificacion planeamento planejamento calendario',
  milestone: 'milestone milestones hito hitos marco marcos',
  skill:
    'skill skills expertise availability habilidad habilidades competencia competencias disponibilidade disponibilidad',
  profile: 'profile perfil security seguridad seguranca password contrasena palavra passe mfa',
  notification: 'notification notifications notificacion notificaciones notificacao notificacoes',
  help: 'help manual manuals ayuda ajuda manuales manuais',
  audit: 'audit auditoria trail historial historico',
  management: 'management gestion gerir gestao data datos dados',
  create:
    'create new add start log record enter crear nuevo nueva nuevos nuevas crear anadir registrar anotar crear criar novo nova novos novas adicionar registar lancar publicar publish generate generar gerar',
  edit: 'edit update change correct revise configure set editar actualizar modificar cambiar corregir revisar configurar definir alterar atualizar corrigir rever',
  view: 'view show list search find open see ver mostrar buscar pesquisar procurar abrir consultar',
  remove:
    'remove delete discard withdraw retirar eliminar borrar descartar remover excluir exclusao',
  submit: 'submit send enviar submeter envio',
  issue: 'issue emitir emision emissao',
  void: 'void cancel anular anulacion anulação anulacao cancelar',
};
const aliases = new Map<string, string>();
for (const [canonical, words] of Object.entries(wordGroups)) {
  for (const word of words.split(' ')) aliases.set(normalizeAssistantText(word), canonical);
}
for (const [canonical, words] of Object.entries({
  daily: 'daily diario diarios',
  technical: 'technical tecnico tecnicos plc',
  signoff: 'signoff firma assinatura',
  credit: 'credit adjustment credito abono ajuste',
  draft: 'draft borrador rascunho',
})) {
  for (const word of words.split(' ')) aliases.set(word, canonical);
}
const qualifiers = new Set(['daily', 'technical', 'signoff', 'credit', 'draft']);
const intents = new Set(['create', 'edit', 'view', 'remove', 'submit', 'issue', 'void']);
const filler = new Set(
  'i want wanna wannt would like to please can you could me a an the my own do for of on in it this that with de del en la las los el un una unos unas quiero quisiera por favor puedo puedes que o os as um uma eu quero gostaria voce para meu minha em no na da dos se necesito need'.split(
    ' ',
  ),
);
const domainVocabulary = [...aliases.entries()].filter(
  ([, word]) => !intents.has(word) && !qualifiers.has(word),
);
const domainFuse = new Fuse(
  domainVocabulary.map(([alias, domain]) => ({ alias, domain })),
  {
    keys: ['alias'],
    threshold: 0.24,
    includeScore: true,
    ignoreLocation: true,
  },
);

function tokens(text: string): string[] {
  return normalizeAssistantText(text)
    .split(' ')
    .filter((word) => word && !filler.has(word))
    .map((word) => aliases.get(word) ?? word);
}
function domainsFor(text: string, fuzzyMatching = true): Set<string> {
  const domains = new Set<string>();
  for (const word of normalizeAssistantText(text).split(' ')) {
    const exact = aliases.get(word);
    if (exact && !intents.has(exact) && !qualifiers.has(exact)) domains.add(exact);
    else if (fuzzyMatching && !exact && word.length >= 4 && !filler.has(word)) {
      const fuzzy = domainFuse.search(word, { limit: 1 })[0];
      if (
        fuzzy &&
        (fuzzy.score ?? 1) <= 0.2 &&
        Math.abs(fuzzy.item.alias.length - word.length) <= 2
      )
        domains.add(fuzzy.item.domain);
    }
  }
  return domains;
}
const taskDomains = new Map(
  assistantTasks.map((task) => [
    task.id,
    domainsFor(
      [
        task.title.en,
        task.title.es,
        task.title.pt,
        ...task.phrases.en,
        ...task.phrases.es,
        ...task.phrases.pt,
      ].join(' '),
      false,
    ),
  ]),
);
const bareChoices: Record<string, readonly string[]> = {
  invoice: [
    'invoice-list',
    'invoice-create',
    'invoice-payment',
    'invoice-issue',
    'invoice-email',
    'invoice-credit',
  ],
  report: [
    'report-list',
    'report-daily',
    'report-technical',
    'report-signoff',
    'report-edit',
    'report-submit',
  ],
  pay: [
    'pay-statement',
    'pay-reimbursement',
    'invoice-payment',
    'finance-compensation-payment',
    'finance-reimbursement',
    'finance-settlement',
  ],
};

export function searchAssistantTasks(
  query: string,
  context: AssistantContext,
  locale: AssistantLocale,
): AssistantSearchResult {
  const normalized = normalizeAssistantText(query);
  if (!normalized) return { kind: 'empty', matches: [] };
  // Portuguese "no projeto" means "in the project". Remove only authored noun
  // constructions from the negation check; Spanish "no crear" still stays blocked.
  const portuguese =
    locale === 'pt' ||
    /\b(?:quero|criar|projeto|projetos|despesa|despesas|relatorio|relatorios|registar|lancar)\b/.test(
      normalized,
    );
  const negationText = portuguese
    ? normalized.replace(
        /\bno (?=(?:projeto|projetos|cliente|clientes|relatorio|relatorios|perfil|calendario|fornecedor|fornecedores|aplicativo)\b)/g,
        '',
      )
    : normalized;
  // Negation cannot be interpreted as an instruction to launch the opposite action.
  if (
    query.length > 500 ||
    /\bdon['’]?t\b/i.test(query) ||
    /\b(?:do not|never|not|no|nunca|nao|sin|sem)\b/.test(negationText)
  )
    return { kind: 'unsupported', matches: [] };
  const queryTokens = tokens(query);
  const queryDomains = domainsFor(query);
  if (!queryDomains.size || normalized.length < 3) return { kind: 'unsupported', matches: [] };
  const available = tasksForContext(context);
  const candidates = available.filter((task) => {
    const domains = taskDomains.get(task.id) ?? new Set<string>();
    // A client invoice is still an invoice request; never fall back to unrelated client controls.
    const primary = ['invoice', 'report', 'mailbox', 'supplier', 'crew', 'time', 'expense'].find(
      (domain) => queryDomains.has(domain),
    );
    return primary ? domains.has(primary) : [...queryDomains].some((domain) => domains.has(domain));
  });
  const queryIntent = queryTokens.find((word) => intents.has(word));
  const content = queryTokens.join(' ');
  const index = candidates.flatMap((task) => {
    // All languages remain searchable when the portal uses a different locale.
    const languages = [
      locale,
      ...(['en', 'es', 'pt'] as const).filter((language) => language !== locale),
    ];
    return languages.flatMap((language) =>
      [task.title[language], ...task.phrases[language]].map((phrase) => ({
        task,
        text: tokens(phrase).join(' '),
      })),
    );
  });
  const fuse = new Fuse(index, {
    keys: ['text'],
    threshold: 0.48,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });
  const scores = new Map<string, { task: AssistantTask; score: number }>();
  for (const match of fuse.search(content)) {
    const phraseTokens = match.item.text.split(' ');
    const coverage =
      queryTokens.filter((token) => phraseTokens.includes(token)).length /
      Math.max(1, queryTokens.length);
    const intentMatches = !queryIntent || phraseTokens.includes(queryIntent);
    const score = Math.min(
      1,
      (1 - (match.score ?? 1)) * 0.6 + coverage * 0.3 + (intentMatches ? 0.1 : 0),
    );
    if (queryIntent && !intentMatches && score < 0.86) continue;
    if (score >= 0.57 && score > (scores.get(match.item.task.id)?.score ?? 0))
      scores.set(match.item.task.id, { task: match.item.task, score });
  }
  // Bare domain requests explicitly expose alternatives; nothing launches automatically.
  if (!queryIntent && queryDomains.size === 1) {
    const domain = [...queryDomains][0] ?? '';
    const preferred = bareChoices[domain];
    if (preferred) {
      const matches = preferred.flatMap((id, position) => {
        const task = available.find((item) => item.id === id);
        return task ? [{ task, score: 0.8 - position * 0.02 }] : [];
      });
      if (matches.length) return { kind: 'matches', matches };
    }
  }
  const matches = [...scores.values()]
    .sort((left, right) => right.score - left.score || left.task.id.localeCompare(right.task.id))
    .slice(0, 6);
  return { kind: matches.length ? 'matches' : 'unsupported', matches };
}
