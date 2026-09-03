import {
  assignmentInputSchema,
  clientContactInputSchema,
  clientInputSchema,
  clientUpdateInputSchema,
  milestoneInputSchema,
  projectInputSchema,
  scheduleInputSchema,
  versionedRecordSchema,
} from '@ja/schemas';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actionFail, actionFailure, actionSuccess } from './action-message';
import { formObject, type PortalActionEvent } from '$lib/server/action-utils';

export const projectActions = {
  createClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = clientInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.clientFields', {}, 'Check client fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createClient(context.principal, parsed.data);
      return actionSuccess(
        'action.projects.clientCreated',
        { clientNumber: result.clientNumber },
        `Created ${result.clientNumber}`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const object = await formObject(request);
    object.isBillingContact = object.isBillingContact === 'on';
    object.isPrimary = object.isPrimary === 'on';
    const parsed = clientContactInputSchema.safeParse(object);
    if (!parsed.success)
      return actionFail(400, 'action.validation.contactFields', {}, 'Check contact fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createClientContact(context.principal, parsed.data);
      return actionSuccess('action.projects.clientContactSaved', {}, 'Client contact saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const projectId = data.get('projectId')?.toString();
    if (!projectId)
      return actionFail(400, 'action.validation.projectIdRequired', {}, 'Project ID required');
    const versionValue = data.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Project version is required',
      );
    const text = (name: string): string | undefined => {
      const value = data.get(name);
      return value === null ? undefined : value.toString();
    };
    const integer = (name: string, nullable = false): number | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (!value.trim()) return nullable ? null : undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
      return parsed;
    };
    const money = (name: string): bigint | null | undefined => {
      const value = text(name);
      if (value === undefined) return undefined;
      if (!value.trim()) return null;
      try {
        return BigInt(value);
      } catch {
        throw new Error(`${name} must be an integer amount in minor units`);
      }
    };
    const hoursToMinutes = (
      hoursName: string,
      minutesName: string,
      nullable = false,
    ): number | null | undefined => {
      const hoursVal = text(hoursName);
      if (hoursVal !== undefined) {
        if (!hoursVal.trim()) return nullable ? null : undefined;
        const parsed = Number(hoursVal);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24)
          throw new Error(`${hoursName} must be a number between 0 and 24`);
        return Math.round(parsed * 60);
      }
      return integer(minutesName, nullable);
    };
    const context = openPortalRepository(locals);
    try {
      context.repository.updateProject(context.principal, {
        projectId,
        version,
        costCenterCode: text('costCenterCode'),
        name: text('name'),
        poNumber: text('poNumber'),
        description: text('description'),
        projectAlias: text('projectAlias'),
        timezone: text('timezone'),
        billingModel: text('billingModel'),
        siteName: text('siteName'),
        country: text('country'),
        projectManagerId: text('projectManagerId') || null,
        expectedMinutesPerDay:
          hoursToMinutes('expectedHoursPerDay', 'expectedMinutesPerDay') ?? undefined,
        clientDailyMinimumMinutes: hoursToMinutes(
          'clientDailyMinimumHours',
          'clientDailyMinimumMinutes',
          true,
        ),
        budgetMinor: money('budgetMinor'),
        revenueBudgetMinor: money('revenueBudgetMinor'),
        poCapMinor: money('poCapMinor'),
        fixedPriceMinor: money('fixedPriceMinor'),
        laborBudgetMinutes: integer('laborBudgetMinutes', true),
        travelBudgetMinor: money('travelBudgetMinor'),
        otherCostBudgetMinor: money('otherCostBudgetMinor'),
        plannedMinutes: integer('plannedMinutes', true),
        contractNumber: text('contractNumber'),
        startDate: text('startDate'),
        plannedEndDate: text('plannedEndDate'),
        budgetType: text('budgetType'),
        weeklyCloseEnabled: data.has('weeklyCloseEnabled')
          ? data.get('weeklyCloseEnabled') === 'on'
          : undefined,
        dailyReportRequired: data.has('dailyReportRequired')
          ? data.get('dailyReportRequired') === 'on'
          : undefined,
        technicalReportingRequired: data.has('technicalReportingRequired')
          ? data.get('technicalReportingRequired') === 'on'
          : undefined,
        notes: text('notes'),
      });
      return actionSuccess('action.projects.projectUpdated', {}, 'Project updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = projectInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.projectFields', {}, 'Check project fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.createProject(context.principal, parsed.data);
      return actionSuccess(
        'action.projects.projectCreated',
        { projectNumber: result.projectNumber },
        `Created ${result.projectNumber}`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  createMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = milestoneInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.milestoneFields', {}, 'Check milestone fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.createProjectMilestone(context.principal, parsed.data);
      return actionSuccess('action.projects.milestoneDraftSaved', {}, 'Milestone draft saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  submitMilestone: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = versionedRecordSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.milestoneRecord', {}, 'Invalid milestone record');
    const context = openPortalRepository(locals);
    try {
      context.repository.submitProjectMilestone(
        context.principal,
        parsed.data.id,
        parsed.data.version,
      );
      return actionSuccess(
        'action.projects.milestoneSubmitted',
        {},
        'Milestone submitted for review',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateSchedule: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = scheduleInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.scheduleFields', {}, 'Check schedule fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.updateProjectSchedule(context.principal, parsed.data);
      return actionSuccess('action.projects.scheduleSaved', {}, 'Expected schedule saved');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  assignWorker: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = assignmentInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(400, 'action.validation.assignmentFields', {}, 'Check assignment fields', {
        fields: parsed.error.flatten().fieldErrors,
      });
    const context = openPortalRepository(locals);
    try {
      context.repository.assignWorker(context.principal, parsed.data);
      return actionSuccess('action.projects.assignmentCreated', {}, 'Assignment created');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const parsed = clientUpdateInputSchema.safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.clientFields',
        {},
        'Check client fields and version',
        { fields: parsed.error.flatten().fieldErrors },
      );
    const { clientId, version, ...input } = {
      ...parsed.data,
      // The repository keeps the update contract string-based while treating
      // an explicit empty string as the intentional clear operation.
      clientCode: parsed.data.clientCode === null ? '' : parsed.data.clientCode,
    };

    const context = openPortalRepository(locals);
    try {
      context.repository.updateClient(context.principal, clientId, input, version);
      return actionSuccess('action.projects.clientUpdated', {}, 'Client updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  transitionClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const clientId = data.get('clientId')?.toString();
    const status = data.get('status')?.toString();
    const version = Number(data.get('version'));
    if (!clientId || !status || !Number.isInteger(version) || version < 1)
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid client transition');
    const reason = data.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A transition reason is required',
      );
    if (!['active', 'closed', 'archived', 'restore'].includes(status))
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid client transition');
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.transitionClient(context.principal, {
        clientId,
        status: status as 'active' | 'closed' | 'archived' | 'restore',
        version,
        reason,
      });
      return actionSuccess(
        'action.projects.clientUpdated',
        { status: result.status },
        'Client lifecycle updated',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  transitionProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const data = await request.formData();
    const projectId = data.get('projectId')?.toString();
    const status = data.get('status')?.toString();
    const version = Number(data.get('version'));
    if (!projectId || !status || !Number.isInteger(version) || version < 1)
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid project transition');
    const reason = data.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A transition reason is required',
      );
    if (
      ![
        'draft',
        'planned',
        'active',
        'paused',
        'closing',
        'closed',
        'archived',
        'restore',
      ].includes(status)
    )
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid project transition');
    const context = openPortalRepository(locals);
    try {
      const result = context.repository.transitionProject(context.principal, {
        projectId,
        status: status as
          | 'draft'
          | 'planned'
          | 'active'
          | 'paused'
          | 'closing'
          | 'closed'
          | 'archived'
          | 'restore',
        version,
        reason,
      });
      return actionSuccess(
        'action.projects.projectUpdated',
        { status: result.status },
        'Project lifecycle updated',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  archiveClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('clientId')?.toString();
    const version = Number(formData.get('version'));
    if (!id || !Number.isInteger(version) || version < 1)
      return actionFail(400, 'action.validation.lifecycleFields', {}, 'Invalid client transition');
    const reason = formData.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A transition reason is required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.transitionClient(context.principal, {
        clientId: id,
        status: 'archived',
        version,
        reason,
      });
      return actionSuccess('action.projects.clientArchived', {}, 'Client archived');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteClient: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('clientId')?.toString();
    if (!id) return actionFail(400, 'action.validation.clientIdRequired', {}, 'Client ID required');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteClient(context.principal, id);
      return actionSuccess('action.projects.clientDeleted', {}, 'Client deleted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteProject: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('projectId')?.toString();
    if (!id)
      return actionFail(400, 'action.validation.projectIdRequired', {}, 'Project ID required');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteProject(context.principal, id);
      return actionSuccess('action.projects.projectDeleted', {}, 'Project deleted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('contactId')?.toString();
    if (!id)
      return actionFail(400, 'action.validation.contactIdRequired', {}, 'Contact ID required');

    const input: Record<string, unknown> = {};
    if (formData.has('name')) input.name = formData.get('name')?.toString();
    if (formData.has('email')) input.email = formData.get('email')?.toString();
    if (formData.has('phone')) input.phone = formData.get('phone')?.toString();
    if (formData.has('role')) input.role = formData.get('role')?.toString();
    if (formData.has('isBillingContact'))
      input.isBillingContact = formData.get('isBillingContact')?.toString() === 'on';
    if (formData.has('isPrimary')) input.isPrimary = formData.get('isPrimary')?.toString() === 'on';

    const context = openPortalRepository(locals);
    try {
      context.repository.updateClientContact(context.principal, id, input);
      return actionSuccess('action.projects.clientContactUpdated', {}, 'Client contact updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteClientContact: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('contactId')?.toString();
    if (!id)
      return actionFail(400, 'action.validation.contactIdRequired', {}, 'Contact ID required');
    const context = openPortalRepository(locals);
    try {
      context.repository.deleteClientContact(context.principal, id);
      return actionSuccess('action.projects.clientContactDeleted', {}, 'Client contact deleted');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  updateAssignment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('assignmentId')?.toString();
    if (!id)
      return actionFail(
        400,
        'action.validation.assignmentIdRequired',
        {},
        'Assignment ID required',
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Assignment version is required',
      );

    const input: {
      startsOn?: string;
      endsOn?: string;
      plannedMinutes?: number;
      canReview?: boolean;
      version: number;
    } = { version };
    if (formData.has('startsOn')) input.startsOn = formData.get('startsOn')?.toString();
    if (formData.has('endsOn')) input.endsOn = formData.get('endsOn')?.toString() || undefined;
    if (formData.has('plannedMinutes'))
      input.plannedMinutes = formData.get('plannedMinutes')
        ? Number(formData.get('plannedMinutes'))
        : undefined;
    if (formData.has('canReview')) input.canReview = formData.get('canReview')?.toString() === 'on';
    input.version = version;

    const context = openPortalRepository(locals);
    try {
      context.repository.updateAssignment(context.principal, id, input);
      return actionSuccess('action.projects.assignmentUpdated', {}, 'Assignment updated');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  removeAssignment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('assignmentId')?.toString();
    if (!id)
      return actionFail(
        400,
        'action.validation.assignmentIdRequired',
        {},
        'Assignment ID required',
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Assignment version is required',
      );
    const reason = formData.get('reason')?.toString().trim();
    if (!reason)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'A removal reason is required',
      );
    const context = openPortalRepository(locals);
    try {
      context.repository.removeAssignment(context.principal, id, {
        endsOn: formData.get('endsOn')?.toString() || undefined,
        reason,
        version,
      });
      return actionSuccess('action.projects.assignmentDeleted', {}, 'Assignment removed');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  deleteAssignment: async ({ locals, request, params }: PortalActionEvent) => {
    if (params.section !== 'projects')
      return actionFail(404, 'action.navigation.wrongSection', {}, 'Wrong section');
    const formData = await request.formData();
    const id = formData.get('assignmentId')?.toString();
    if (!id)
      return actionFail(
        400,
        'action.validation.assignmentIdRequired',
        {},
        'Assignment ID required',
      );
    const versionValue = formData.get('version')?.toString().trim();
    const version = versionValue === undefined ? Number.NaN : Number(versionValue);
    if (!versionValue || !Number.isInteger(version) || version < 1)
      return actionFail(
        400,
        'action.validation.lifecycleFields',
        {},
        'Assignment version is required',
      );
    const reason =
      formData.get('reason')?.toString().trim() || 'Removed by an authorized administrator';
    const context = openPortalRepository(locals);
    try {
      context.repository.removeAssignment(context.principal, id, {
        reason,
        endsOn: formData.get('endsOn')?.toString() || undefined,
        version,
      });
      return actionSuccess('action.projects.assignmentDeleted', {}, 'Assignment removed');
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
