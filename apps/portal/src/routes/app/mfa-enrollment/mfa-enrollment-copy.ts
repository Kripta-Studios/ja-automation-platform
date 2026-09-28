import type { PortalLocale } from '$lib/portal-i18n';
import type { ProblemData } from '$lib/problem/contract';

export type MfaEnrollmentCopy = Readonly<{
  title: string;
  eyebrow: string;
  heading: string;
  intro: string;
  enable: string;
  starting: string;
  finishHeading: string;
  finishIntro: string;
  setupUriLabel: string;
  recoveryHeading: string;
  recoveryWarning: string;
  recoveryCodesLabel: string;
  codeLabel: string;
  verifying: string;
  verify: string;
  retry: string;
  disableWarning: string;
  reviewMfaSettings: string;
  reviewMfaCode: string;
  reviewMfaStatus: string;
  statusUnverified: string;
  contactOwner: string;
  signInAgain: string;
  continueWithout: string;
  signOut: string;
  signOutFailed: string;
}>;

export const mfaEnrollmentCopy: Record<PortalLocale, MfaEnrollmentCopy> = {
  en: {
    title: 'Set up MFA | J&A Automation',
    eyebrow: 'ACCOUNT MFA',
    heading: 'Set up your authenticator',
    intro: 'Add an authenticator app to protect your workspace access, {name}.',
    enable: 'Enable MFA',
    starting: 'Starting setup…',
    finishHeading: 'Finish authenticator setup',
    finishIntro:
      'Add this URI to your authenticator, then enter the current six-digit code to confirm the device.',
    setupUriLabel: 'Authenticator setup URI',
    recoveryHeading: 'One-time recovery codes',
    recoveryWarning:
      'Save these codes in an approved password manager now. They are shown only once and are needed if your authenticator is unavailable.',
    recoveryCodesLabel: 'One-time recovery codes',
    codeLabel: 'Authenticator code',
    verifying: 'Verifying…',
    verify: 'Verify MFA',
    retry:
      'Keep this page open until verification is complete. If you lose these setup values, review your current MFA status before starting again.',
    disableWarning:
      'Disabling MFA removes the authenticator check from future sign-ins. Review your account security before continuing.',
    reviewMfaSettings: 'Review MFA settings',
    reviewMfaCode: 'Check the authenticator code',
    reviewMfaStatus: 'Review current MFA status',
    statusUnverified: 'Status needs review',
    contactOwner: 'Contact an owner',
    signInAgain: 'Sign in again',
    continueWithout: 'Continue without MFA',
    signOut: 'Sign out',
    signOutFailed:
      'Sign-out was not confirmed. Check whether you are still signed in before trying again.',
  },
  es: {
    title: 'Configurar MFA | J&A Automation',
    eyebrow: 'MFA DE LA CUENTA',
    heading: 'Configure su autenticador',
    intro:
      'Agregue una aplicación de autenticación para proteger el acceso al espacio de trabajo, {name}.',
    enable: 'Activar MFA',
    starting: 'Iniciando configuración…',
    finishHeading: 'Finalice la configuración del autenticador',
    finishIntro:
      'Agregue este URI a su autenticador y escriba el código actual de seis dígitos para confirmar el dispositivo.',
    setupUriLabel: 'URI de configuración del autenticador',
    recoveryHeading: 'Códigos de recuperación de un solo uso',
    recoveryWarning:
      'Guarde estos códigos ahora en un gestor de contraseñas aprobado. Solo se muestran una vez y son necesarios si su autenticador no está disponible.',
    recoveryCodesLabel: 'Códigos de recuperación de un solo uso',
    codeLabel: 'Código del autenticador',
    verifying: 'Verificando…',
    verify: 'Verificar MFA',
    retry:
      'Mantenga esta página abierta hasta completar la verificación. Si pierde estos datos, revise el estado actual de MFA antes de comenzar de nuevo.',
    disableWarning:
      'Al desactivar MFA, los próximos inicios de sesión dejarán de pedir el código del autenticador. Revise la seguridad de su cuenta antes de continuar.',
    reviewMfaSettings: 'Revisar configuración de MFA',
    reviewMfaCode: 'Comprobar el código del autenticador',
    reviewMfaStatus: 'Revisar el estado actual de MFA',
    statusUnverified: 'Estado pendiente de revisión',
    contactOwner: 'Contactar a un propietario',
    signInAgain: 'Iniciar sesión de nuevo',
    continueWithout: 'Continuar sin MFA',
    signOut: 'Cerrar sesión',
    signOutFailed:
      'No se confirmó el cierre de sesión. Compruebe si aún tiene una sesión activa antes de intentarlo de nuevo.',
  },
  pt: {
    title: 'Configurar MFA | J&A Automation',
    eyebrow: 'MFA DA CONTA',
    heading: 'Configure seu autenticador',
    intro:
      'Adicione um aplicativo autenticador para proteger o acesso ao espaço de trabalho, {name}.',
    enable: 'Ativar MFA',
    starting: 'Iniciando configuração…',
    finishHeading: 'Conclua a configuração do autenticador',
    finishIntro:
      'Adicione este URI ao seu autenticador e informe o código atual de seis dígitos para confirmar o dispositivo.',
    setupUriLabel: 'URI de configuração do autenticador',
    recoveryHeading: 'Códigos de recuperação de uso único',
    recoveryWarning:
      'Salve estes códigos agora em um gerenciador de senhas aprovado. Eles são exibidos apenas uma vez e são necessários se seu autenticador não estiver disponível.',
    recoveryCodesLabel: 'Códigos de recuperação de uso único',
    codeLabel: 'Código do autenticador',
    verifying: 'Verificando…',
    verify: 'Verificar MFA',
    retry:
      'Mantenha esta página aberta até concluir a verificação. Se perder estes dados, revise o estado atual da MFA antes de começar novamente.',
    disableWarning:
      'Desativar a MFA remove a verificação pelo autenticador dos próximos acessos. Revise a segurança da sua conta antes de continuar.',
    reviewMfaSettings: 'Revisar configurações da MFA',
    reviewMfaCode: 'Conferir o código do autenticador',
    reviewMfaStatus: 'Revisar o estado atual da MFA',
    statusUnverified: 'Estado precisa de revisão',
    contactOwner: 'Contatar um proprietário',
    signInAgain: 'Entrar novamente',
    continueWithout: 'Continuar sem MFA',
    signOut: 'Sair',
    signOutFailed:
      'A saída não foi confirmada. Verifique se a sessão ainda está ativa antes de tentar novamente.',
  },
};

export function formatMfaEnrollmentCopy(template: string, name: string): string {
  return template.replace('{name}', name);
}

const mfaProblemKeys: Readonly<Record<string, string>> = {
  MFA_SIGN_IN_REQUIRED: 'problem.mfa.signInRequired',
  MFA_ACTION_INVALID: 'problem.mfa.actionInvalid',
  MFA_CODE_INVALID: 'problem.mfa.codeInvalid',
  MFA_ALREADY_ENROLLED: 'problem.mfa.alreadyEnrolled',
  MFA_VERIFICATION_REJECTED: 'problem.mfa.verificationRejected',
  MFA_REQUEST_REJECTED: 'problem.mfa.requestRejected',
  MFA_CHANGE_CONFLICT: 'problem.mfa.changeConflict',
  MFA_CHANGE_NOT_PERMITTED: 'problem.mfa.changeNotPermitted',
  MFA_AUDIT_UNAVAILABLE: 'problem.mfa.auditUnavailable',
  MFA_CHANGE_STATE_UNCERTAIN: 'problem.mfa.changeStateUncertain',
  MFA_CHANGE_UNAVAILABLE: 'problem.mfa.changeUnavailable',
};

/** Accept only the safe public problem contract from the MFA endpoint. */
export function mfaProblemFromResponse(value: unknown): ProblemData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.code !== 'string' ||
    typeof data.messageKey !== 'string' ||
    mfaProblemKeys[data.code] !== data.messageKey
  )
    return null;
  const remedies = Array.isArray(data.remedies)
    ? data.remedies.filter(
        (remedy): remedy is { id: string } =>
          Boolean(remedy) &&
          typeof remedy === 'object' &&
          typeof (remedy as { id?: unknown }).id === 'string',
      )
    : [];
  return {
    code: data.code,
    messageKey: data.messageKey as ProblemData['messageKey'],
    params:
      data.params && typeof data.params === 'object' ? (data.params as ProblemData['params']) : {},
    fieldErrors:
      data.fieldErrors && typeof data.fieldErrors === 'object'
        ? (data.fieldErrors as ProblemData['fieldErrors'])
        : {},
    remedies,
    correlationId: typeof data.correlationId === 'string' ? data.correlationId : '',
  };
}

export function mfaUncertainProblem(): ProblemData {
  return {
    code: 'MFA_NETWORK_OUTCOME_UNKNOWN',
    messageKey: 'problem.mfa.networkOutcomeUnknown',
    params: {},
    fieldErrors: {},
    remedies: [{ id: 'review_mfa_status' }, { id: 'contact_owner' }],
    correlationId: '',
  };
}

export function mfaProblemIsService(problem: ProblemData): boolean {
  return [
    'MFA_AUDIT_UNAVAILABLE',
    'MFA_CHANGE_STATE_UNCERTAIN',
    'MFA_CHANGE_UNAVAILABLE',
    'MFA_NETWORK_OUTCOME_UNKNOWN',
  ].includes(problem.code);
}
