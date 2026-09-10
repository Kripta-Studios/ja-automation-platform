import { describe, expect, it } from 'vitest';
import { hasEmailConsent, quarantineUnconfirmedEmail } from '@ja/database';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

describe('email consent cutover', () => {
  it('quarantines old and automated mail, preserves accepted/uncertain history, and processes only confirmed mail', async () => {
    const f = createB5LifecycleSecurityFixture();
    try {
      const now = new Date().toISOString();
      const rows = [
        ['notice', 'notification.email.requested', '{"emailConfirmed":true}', null, null],
        ['issue', 'invoice.issued', '{"emailConfirmed":true}', null, null],
        ['legacy', 'invitation.created', '{}', null, null],
        ['string', 'invoice.email.requested', '{"emailConfirmed":"true"}', null, null],
        ['bad', 'public-inquiry.received', 'bad-json', null, null],
        ['accepted', 'notification.email.requested', '{}', now, null],
        ['uncertain', 'invitation.created', '{}', null, 'DELIVERY_IN_PROGRESS:old'],
        ['confirmed', 'public-inquiry.received', '{"emailConfirmed":true}', null, null],
      ];
      for (const [id, topic, payload, delivered, error] of rows)
        f.sqlite
          .prepare(
            'INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,delivered_at,last_error) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(id!, topic!, id!, id!, payload!, now, now, delivered!, error!);
      expect(Number(quarantineUnconfirmedEmail(f.sqlite).changes)).toBe(5);
      expect(Number(quarantineUnconfirmedEmail(f.sqlite).changes)).toBe(0);
      expect(
        f.sqlite
          .prepare("SELECT delivered_at,last_error FROM outbox_event WHERE id='accepted'")
          .get(),
      ).toEqual({ delivered_at: now, last_error: null });
      expect(
        f.sqlite.prepare("SELECT last_error FROM outbox_event WHERE id='uncertain'").get(),
      ).toEqual({ last_error: 'DELIVERY_IN_PROGRESS:old' });
      const processed: string[] = [];
      await f.v3.runDueOutbox(20, async (event) => {
        processed.push(event.id);
      });
      expect(processed).toEqual(['confirmed']);
      expect(
        f.sqlite.prepare("SELECT last_error FROM outbox_event WHERE id='uncertain'").get(),
      ).toEqual({ last_error: 'SMTP_DELIVERY_UNCERTAIN' });
      expect(hasEmailConsent('notification.email.requested', { emailConfirmed: true })).toBe(false);
      expect(hasEmailConsent('invitation.created', { emailConfirmed: 'true' })).toBe(false);
    } finally {
      closeB5LifecycleSecurityFixture(f);
    }
  });
});
