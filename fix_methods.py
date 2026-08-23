import re
with open('packages/database/src/repository.ts', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r'deleteExpense\(principal: Principal, expenseId: string\)', 'deleteExpense(principal: Principal, expenseId: string, version?: number)', content)
content = re.sub(r'deleteTime\(principal: Principal, timeId: string\)', 'deleteTime(principal: Principal, timeId: string, version?: number)', content)
content = re.sub(r'updateProject\(principal: Principal, projectId: string, input: any\)', 'updateProject(principal: Principal, input: any)', content)
content = re.sub(r"this.sqlite.prepare\('UPDATE project SET name = \? WHERE id = \?'\).run\(input.name, projectId\);", "this.sqlite.prepare('UPDATE project SET name = ?, po_number = ?, status = ? WHERE id = ?').run(input.name, input.poNumber, input.status, input.projectId);", content)
content = re.sub(r"this.audit\(principal, 'UPDATE', 'project', projectId, input\);", "this.audit(principal, 'UPDATE', 'project', input.projectId, input);", content)
with open('packages/database/src/repository.ts', 'w', encoding='utf-8') as f:
    f.write(content)
