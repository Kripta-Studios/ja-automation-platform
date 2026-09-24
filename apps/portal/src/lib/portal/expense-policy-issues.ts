const issueLabels: Record<string, string> = {
  missing_assignment: 'No project assignment covers this expense date.',
  ambiguous_assignment: 'Multiple project assignments cover this expense date.',
  missing_policy: 'No person expense policy matches this payer, category and expense date.',
  expense_not_found: 'This expense is no longer available.',
  fx_required: 'Expense currency conversion is required before classification.',
};

export function expensePolicyIssueLabels(
  issues: readonly string[] | undefined,
  translate: (message: string) => string,
): string[] {
  if (!issues?.length) return [translate('No matching policy')];
  return issues.map((issue) => translate(issueLabels[issue] ?? 'Expense policy needs review.'));
}
