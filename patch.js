const fs = require('fs');
let content = fs.readFileSync('packages/database/src/v3-repository.ts', 'utf8');
const append = `
  reserveUpload(
    principal: Principal,
    input: Readonly<{
      projectId?: string;
      originalFilename: string;
      artifactType: string;
      description?: string;
      sensitivity?: 'internal' | 'sensitive' | 'customer_private';
    }>,
  ): { reservationId: string; storageKey: string } {
    this.assertActive(principal);
    if (input.projectId && principal.role !== 'owner_admin' && principal.role !== 'finance_admin')
      this.assertProjectAccess(principal, input.projectId);
    
    if (!input.artifactType) throw new V3ValidationError('Artifact type is required');
    if (input.description === '') throw new V3ValidationError('Description is invalid');
    
    const reservationId = newId();
    const nowStr = timestamp();
    const safeFilename =
      input.originalFilename
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/\\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'artifact';
    const folder = input.artifactType.toLowerCase().includes('backup')
      ? 'plc-backups'
      : input.artifactType.toLowerCase().includes('report')
        ? 'reports'
        : 'technical';
    const datePath = nowStr.slice(0, 10).replace(/-/g, '/');
    const storageKey = 'uploads/' + datePath + '/' + reservationId + '/' + safeFilename;

    this.sqlite.prepare(\`
      INSERT INTO document(
        id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,
        original_filename,description,artifact_type,sensitivity,safe_filename,
        scan_status,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    \`).run(
      reservationId,
      input.projectId ?? null,
      principal.userId,
      'pending',
      'application/octet-stream',
      0,
      'reserved',
      storageKey,
      input.originalFilename.slice(0, 200),
      input.description ?? null,
      input.artifactType,
      input.sensitivity ?? 'internal',
      safeFilename,
      'not_scanned',
      nowStr,
      nowStr
    );
    
    return { reservationId, storageKey };
  }

  finalizeUpload(
    principal: Principal,
    reservationId: string,
    input: Readonly<{
      sha256: string;
      mediaType: string;
      byteLength: number;
    }>
  ): { created: boolean } {
    this.assertActive(principal);
    
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new V3ValidationError('Invalid document hash');
    if (
      !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 1 ||
      input.byteLength > 50_000_000
    )
      throw new V3ValidationError('Document size is invalid');

    const allowedMediaTypes = new Set([
      'application/pdf',
      'application/zip',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'text/plain',
    ]);
    if (!allowedMediaTypes.has(input.mediaType))
      throw new V3ValidationError('Unsupported private document media type');

    return this.transaction(() => {
      const reservation = this.sqlite.prepare(
        'SELECT owner_id, state FROM document WHERE id=?'
      ).get(reservationId) as { owner_id: string; state: string } | undefined;
      
      if (!reservation) throw new V3ValidationError('Reservation not found');
      if (reservation.owner_id !== principal.userId) throw new V3AccessDeniedError('Upload ownership mismatch');
      if (reservation.state !== 'reserved') throw new V3ConflictError('Upload already finalized');

      const malwareScanRequired = process.env.JA_MALWARE_SCANNER_REQUIRED === 'true' && (!!process.env.JA_MALWARE_SCANNER_URL || process.env.NODE_ENV === 'production');

      this.sqlite.prepare(\`
        UPDATE document SET
          sha256=?, media_type=?, byte_length=?, state=?, scan_status=?, updated_at=?
        WHERE id=?
      \`).run(
        input.sha256,
        input.mediaType,
        input.byteLength,
        malwareScanRequired ? 'quarantined' : 'committed',
        malwareScanRequired ? 'pending' : 'not_scanned',
        timestamp(),
        reservationId
      );

      if (malwareScanRequired) {
        this.sqlite.prepare(
          'INSERT OR IGNORE INTO job(id,kind,idempotency_key,state,run_after,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
        ).run(
          newId(),
          'document_scan',
          'document-scan:' + reservationId,
          'pending',
          timestamp(),
          JSON.stringify({ documentId: reservationId }),
          timestamp(),
          timestamp()
        );
      }

      this.audit(principal, 'document.upload_finalized', 'document', reservationId, {
        byteLength: input.byteLength,
      });

      return { created: true };
    });
  }
}
`;
content = content.replace(/}$/, append);
fs.writeFileSync('packages/database/src/v3-repository.ts', content);
