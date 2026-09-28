import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createDatabase } from '../index.ts';
import {
  DURABLE_JOB_CAPABILITIES,
  provisionServiceActor,
  type DurableJobCapability,
  type ServiceActorProvisionResult,
} from '../domains/jobs/service-actor-repository.ts';

export type ServiceActorCliCommand = 'provision' | 'rotate';

export type ServiceActorCliArgs = Readonly<{
  command: ServiceActorCliCommand;
  tenantId: string;
  deploymentId: string;
  actorId: string;
  name: string;
  boundByUserId: string;
  capabilities?: readonly DurableJobCapability[];
  databasePath?: string;
}>;

const FLAG_NAMES = new Set([
  '--tenant-id',
  '--deployment-id',
  '--actor-id',
  '--name',
  '--bound-by-user-id',
  '--capabilities',
  '--database-path',
]);

const CAPABILITY_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9_-]+)+$/u;

function cliError(code: string): never {
  throw new Error(code);
}

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) cliError(`SERVICE_ACTOR_CLI_ARGUMENT_MISSING:${flag}`);
  return value;
}

function parseCapabilities(value: string): readonly DurableJobCapability[] {
  const values = value.split(',');
  if (
    values.length === 0 ||
    values.some(
      (capability) =>
        !capability || capability !== capability.trim() || !CAPABILITY_PATTERN.test(capability),
    )
  )
    cliError('INVALID_SERVICE_ACTOR_CLI_CAPABILITIES');
  const allowed = new Set<string>(DURABLE_JOB_CAPABILITIES);
  if (
    values.length !== DURABLE_JOB_CAPABILITIES.length ||
    values.some((capability) => !allowed.has(capability)) ||
    new Set(values).size !== values.length
  )
    cliError('INVALID_SERVICE_ACTOR_CLI_CAPABILITIES');
  return DURABLE_JOB_CAPABILITIES.filter((capability) => values.includes(capability));
}

/**
 * Parse the operator CLI contract. Deployment identity may come from the
 * explicit flags or the two deployment environment settings; actor, name and
 * binder always remain explicit CLI values.
 */
export function parseServiceActorCliArgs(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): ServiceActorCliArgs {
  const command = argv[0];
  if (command !== 'provision' && command !== 'rotate')
    cliError('SERVICE_ACTOR_CLI_COMMAND_INVALID');

  const values = new Map<string, string>();
  let capabilities: readonly DurableJobCapability[] | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag || !flag.startsWith('--') || !FLAG_NAMES.has(flag))
      cliError('UNKNOWN_SERVICE_ACTOR_OPTION');
    const value = valueAfter(argv, index, flag);
    index += 1;
    if (flag === '--capabilities') {
      if (capabilities !== undefined) cliError('DUPLICATE_SERVICE_ACTOR_OPTION');
      capabilities = parseCapabilities(value);
      continue;
    }
    if (values.has(flag)) cliError('DUPLICATE_SERVICE_ACTOR_OPTION');
    values.set(flag, value);
  }

  const tenantId = values.get('--tenant-id') ?? environment.JA_TENANT_ID;
  const deploymentId = values.get('--deployment-id') ?? environment.JA_DEPLOYMENT_ID;
  if (!tenantId) cliError('SERVICE_ACTOR_CLI_ARGUMENT_MISSING:--tenant-id');
  if (!deploymentId) cliError('SERVICE_ACTOR_CLI_ARGUMENT_MISSING:--deployment-id');
  const required = [
    ['--actor-id', 'actorId'],
    ['--name', 'name'],
    ['--bound-by-user-id', 'boundByUserId'],
  ] as const;
  for (const [flag] of required)
    if (!values.has(flag)) cliError(`SERVICE_ACTOR_CLI_ARGUMENT_MISSING:${flag}`);

  const databasePath = values.get('--database-path');
  return {
    command,
    tenantId,
    deploymentId,
    actorId: values.get('--actor-id')!,
    name: values.get('--name')!,
    boundByUserId: values.get('--bound-by-user-id')!,
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(databasePath === undefined ? {} : { databasePath: resolve(databasePath) }),
  };
}

function withDeploymentEnvironment<T>(args: ServiceActorCliArgs, work: () => T): T {
  const previousTenant = process.env.JA_TENANT_ID;
  const previousDeployment = process.env.JA_DEPLOYMENT_ID;
  if (previousTenant !== undefined && previousTenant !== args.tenantId)
    cliError('DEPLOYMENT_IDENTITY_MISMATCH');
  if (previousDeployment !== undefined && previousDeployment !== args.deploymentId)
    cliError('DEPLOYMENT_IDENTITY_MISMATCH');
  process.env.JA_TENANT_ID = args.tenantId;
  process.env.JA_DEPLOYMENT_ID = args.deploymentId;
  try {
    return work();
  } finally {
    if (previousTenant === undefined) delete process.env.JA_TENANT_ID;
    else process.env.JA_TENANT_ID = previousTenant;
    if (previousDeployment === undefined) delete process.env.JA_DEPLOYMENT_ID;
    else process.env.JA_DEPLOYMENT_ID = previousDeployment;
  }
}

/** Execute provisioning against the requested database and close the handle on every path. */
export function executeServiceActorCli(
  argv: readonly string[] = process.argv.slice(2),
): ServiceActorProvisionResult {
  const args = parseServiceActorCliArgs(argv);
  return withDeploymentEnvironment(args, () => {
    const database = createDatabase(args.databasePath);
    try {
      return provisionServiceActor(database.sqlite, {
        tenantId: args.tenantId,
        deploymentId: args.deploymentId,
        actorId: args.actorId,
        name: args.name,
        boundByUserId: args.boundByUserId,
        ...(args.capabilities === undefined ? {} : { capabilities: args.capabilities }),
        rotate: args.command === 'rotate',
      });
    } finally {
      database.sqlite.close();
    }
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMainModule()) {
  try {
    process.stdout.write(`${JSON.stringify(executeServiceActorCli())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
