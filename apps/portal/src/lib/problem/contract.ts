/** Stable, serializable failure data shared by native and enhanced form actions. */
export type ProblemParam = string | number | boolean | null;
export type ProblemParams = Readonly<Record<string, ProblemParam>>;
export type ProblemFieldErrors = Readonly<Record<string, readonly string[]>>;

/** A remedy is an allowed next step. The UI decides its translated label and URL. */
export type ProblemRemedy = Readonly<{
  id: string;
  projectId?: string;
  recordId?: string;
}>;

export type ProblemData = Readonly<{
  code: string;
  messageKey: `problem.${string}` | `action.${string}`;
  params: ProblemParams;
  fieldErrors: ProblemFieldErrors;
  remedies: readonly ProblemRemedy[];
  correlationId: string;
}>;
