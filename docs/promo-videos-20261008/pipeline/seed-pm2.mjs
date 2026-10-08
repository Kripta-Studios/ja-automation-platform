import { open, approveItem } from './seed-lib.mjs';
const s = await open('project-manager');
const q = '/approvals?tab=reports&status=submitted&lang=en';
await approveItem(s.page, q, 'Daily report · Completed PLC I/O checkout', 'Approve report');
await approveItem(s.page, q, 'Technical report · Line 3 case packer', 'Approve report');
await s.close();
