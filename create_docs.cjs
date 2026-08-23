const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('packages/database/data/demo.db');

const dummyPdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n4 0 obj\n<< /Length 53 >>\nstream\nBT /F1 24 Tf 100 700 Td (Synthetic Mock Document) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000289 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n393\n%%EOF',
  'utf-8'
);

db.each('SELECT storage_key FROM document', (err, row) => {
  if (err) throw err;
  const filePath = path.join('data/documents', row.storage_key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, dummyPdf);
  console.log('Created synthetic document at ' + filePath);
});
