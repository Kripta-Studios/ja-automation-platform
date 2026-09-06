import type { PortalLocale } from '$lib/portal-i18n';

export type MfaEnrollmentCopy = Readonly<{
  title: string;
  eyebrow: string;
  heading: string;
  intro: string;
  passwordLabel: string;
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
  continueWithout: string;
  signOut: string;
  enrollmentRequired: string;
  setupRejected: string;
  setupIncomplete: string;
  signOutFailed: string;
}>;

export const mfaEnrollmentCopy: Record<PortalLocale, MfaEnrollmentCopy> = {
  en: {
    title: 'Set up MFA | J&A Automation',
    eyebrow: 'ACCOUNT MFA',
    heading: 'Set up your authenticator',
    intro: 'Add an authenticator app to protect your workspace access, {name}.',
    passwordLabel: 'Confirm with password',
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
      'If you refresh or lose these values before verification, restart setup with your password.',
    continueWithout: 'Continue without MFA',
    signOut: 'Sign out',
    enrollmentRequired: 'MFA enrollment is not available for this request.',
    setupRejected: 'MFA setup was not accepted.',
    setupIncomplete: 'MFA setup could not be completed safely. Please restart setup.',
    signOutFailed: 'Sign-out was not completed. Try again.',
  },
  es: {
    title: 'Configurar MFA | J&A Automation',
    eyebrow: 'MFA DE LA CUENTA',
    heading: 'Configure su autenticador',
    intro:
      'Agregue una aplicación de autenticación para proteger el acceso al espacio de trabajo, {name}.',
    passwordLabel: 'Confirme con la contraseña',
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
      'Si actualiza la página o pierde estos valores antes de verificar, reinicie la configuración con su contraseña.',
    continueWithout: 'Continuar sin MFA',
    signOut: 'Cerrar sesión',
    enrollmentRequired: 'La inscripción en MFA no está disponible para esta solicitud.',
    setupRejected: 'No se aceptó la configuración de MFA.',
    setupIncomplete:
      'La configuración de MFA no se pudo completar de forma segura. Reinicie la configuración.',
    signOutFailed: 'No se completó el cierre de sesión. Inténtelo de nuevo.',
  },
  pt: {
    title: 'Configurar MFA | J&A Automation',
    eyebrow: 'MFA DA CONTA',
    heading: 'Configure seu autenticador',
    intro:
      'Adicione um aplicativo autenticador para proteger o acesso ao espaço de trabalho, {name}.',
    passwordLabel: 'Confirme com a senha',
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
      'Se você atualizar a página ou perder estes valores antes da verificação, reinicie a configuração com sua senha.',
    continueWithout: 'Continuar sem MFA',
    signOut: 'Sair',
    enrollmentRequired: 'A inscrição em MFA não está disponível para esta solicitação.',
    setupRejected: 'A configuração de MFA não foi aceita.',
    setupIncomplete:
      'A configuração de MFA não pôde ser concluída com segurança. Reinicie a configuração.',
    signOutFailed: 'Não foi possível concluir a saída. Tente novamente.',
  },
};

export function formatMfaEnrollmentCopy(template: string, name: string): string {
  return template.replace('{name}', name);
}
