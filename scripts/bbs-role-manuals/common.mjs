// Shared instructions are generated once so role handoffs cannot drift.
export function commonChapters(role) {
  const owner = role === 'owner';
  const financial = ['owner', 'finance', 'auditor'].includes(role);
  const figure = (name, caption) => ({
    src: `docs/evidence/bbs-readiness-20261006/owner-common/screenshots/${name}`,
    caption,
    orientation: 'landscape',
  });
  const practice = {
    id: 'practice',
    title: 'Before practising · live and training access',
    paragraphs: [
      'The company portal https://j-aautomation.com/j-aautomation/app is LIVE. A link to it never enters a simulation. For practice obtain a separately provisioned training URL, your own account, the permitted fictional project and dates, a visible environment identifier and the trainer’s reset procedure. Without those, use this guide as a read-only demonstration and enter only authorized genuine work.',
      financial
        ? 'Original BBS examples include historical live-deployment records. Later financial training exercises used isolated copies or separate synthetic portfolios. Each chapter identifies its dataset and checkpoint. A later screenshot does not change an earlier saved workbook or issued document.'
        : 'Original BBS examples include historical live-deployment records. Later training exercises used isolated copies. Each chapter identifies its dataset and checkpoint. Follow the dates and saved states shown for that exercise.',
      owner
        ? 'A role, project membership, review permission, supplier authorization and dated crew delegation are separate. Use your own credentials. Inspect another person’s permitted operational record without signing in as them. Ordinary workers and project managers do not receive customer prices, internal cost, margins or another worker’s compensation.'
        : 'A role, project membership, review permission, supplier authorization and dated crew delegation are separate. Use your own credentials and follow the tasks assigned to your role. Check the selected project and person before recording work.',
    ],
    checks: [
      'Confirm your displayed identity, the environment, project number and work dates before saving. For training/reset or lost access contact admin@j-aautomation.com; send the route, role, project/record reference, time and visible error. Keep passwords, activation links, recovery codes and cookies private.',
    ],
    recovery: [
      owner
        ? 'For an empty selector, inspect account status, active membership dates, supplier authorization and delegation yourself. If deployment identity or legal issuer history is outside the offered controls, send the evidence to platform support.'
        : 'For an empty project selector, ask the Owner to check account status and assignment/authorization coverage. Do not create a duplicate project or borrow another account.',
    ],
  };
  const access = {
    id: 'access',
    title: 'Access · activate the invitation and sign in',
    route: 'Your trusted invitation → Activate your account → Return to sign in → Profile',
    steps: [
      'Check the portal address and named account against the invitation provided by the Owner. There is no public sign-up. For an already provisioned account, use the sign-in method supplied to you; do not attempt to activate someone else’s invitation.',
      'For a single-use activation link, open Activate your account. Enter Full name and choose a Password of at least 12 characters, then Activate account. Wait for Account activated. You can sign in now. Do not repeatedly submit while Activating… is displayed.',
      'Choose Return to sign in. Enter your account Email and Password and select Continue to workspace. If you previously enabled MFA, complete Verify your identity with the current Six-digit code and Verify and continue. Use a recovery code only through the offered Use a recovery code control.',
      'Open Profile and verify the own-account name/email/role in Account security. Check the navigation and assigned project. A newly activated account can have zero assignments; activation alone does not grant project access or supplier/chief authority.',
    ],
    checks: [
      'The activation success message precedes the separate sign-in. The illustrated new Worker signed in and reached their own Profile; no assignment or financial permission was implied.',
    ],
    recovery: [
      'An expired or already used link displays This invitation could not be activated. It may have expired or already been used. If activation already succeeded, return to sign in. Otherwise request a new invitation from the Owner; reloading does not renew the old link.',
      'For offline, temporarily unavailable or rate-limited activation, retain the entered name/password privately, restore connectivity or wait for the displayed retry interval, then retry. An unconfirmed response is not proof of an active account.',
      'For an incorrect password, inactive account or lost access, contact admin@j-aautomation.com from your verified account/contact channel. Supply identity and the visible error; never send the password. This guide does not promise a public password-reset form. The initial Owner is provisioned by the platform operator; an existing Owner provisions the remaining team.',
    ],
    figures: [
      figure(
        'access-activated.png',
        'Isolated new recipient: the native activation success message. The password remains masked; this is separate from sign-in.',
      ),
      figure(
        'access-used-invitation.png',
        'Reusing the same single-use training invitation shows the genuine recovery message. Return to sign in if already activated; otherwise request a new invitation.',
      ),
    ],
  };
  const trainer = {
    id: 'trainer-setup',
    title: 'Trainer setup · prepare a normal cycle before exceptions',
    paragraphs: [
      'Ask the trainer to provide the following checkpoint sheet before reproducing a lesson. Reusing a shared historical BBS period does not reset it. A production URL is never a training switch.',
    ],
    table: {
      headers: ['Checkpoint', 'Required starting condition'],
      rows: [
        [
          'Identity and environment',
          'Own correctly provisioned role/profile; isolated URL and visible environment identity.',
        ],
        [
          'Project and dates',
          'Exact project number, timezone and unused eligible lesson dates; membership and relevant grants cover both current access and the work date.',
        ],
        [
          'Source state',
          'Named source IDs and durations/amounts; ordinary starting drafts/submissions; no unrelated correction already open.',
        ],
        [
          'Financial/evidence locks',
          'List issued/closed periods, finalized settlements and signed report versions. Teach ordinary correction on an unlocked scope first.',
        ],
        [
          'Expected outcome',
          'Saved state, source count, actual total and appropriate own/customer/internal output. Include the receiving role and result.',
        ],
        [
          'Reset',
          'Operator restores the prepared database AND private documents together to the named checkpoint while training is stopped. Trainees do not delete financial history to reset a lesson.',
        ],
      ],
    },
    checks: [
      'The new normal Worker/Chief lesson uses BBS READINESS · normal work cycle (C-0050-P-2026100601) with initially unfinalized October work. Original BBS locked-period examples are exceptions. External/Supplier/PM October 13–19 and Finance October 26 demonstrations are separately labelled; Accounting can use a separate clean synthetic portfolio.',
    ],
  };
  const review = {
    id: 'review-authority',
    title: 'Review authority · who receives each source',
    paragraphs: [
      'Review is determined by the actual source, base role and current dated grants. Chief delegation alone grants recording, not approval. A Worker with Can review checked does not become a Project Manager or Finance user. Send a factual correction reason with every return.',
    ],
    table: {
      headers: ['Source / recorder', 'Operational reviewer and prerequisite', 'Next handoff'],
      rows: [
        [
          'Internal own or chief-delegated time',
          'Owner or Finance; assigned PM with current active Can review membership for this project.',
          financial
            ? 'Owner/Finance records commercial Billable or Non-billable review separately.'
            : 'Submit the checked work to the authorized reviewer and verify the resulting state.',
        ],
        [
          'External/supplier time, including coordinator own time',
          'Authorized Owner. Supplier authorization/recorder provenance keeps these sources outside the ordinary PM time queue.',
          financial ? 'Finance review follows Owner approval.' : 'Verify the resulting review state.',
        ],
        [
          'Own/delegated expenses',
          'Owner or Finance; assigned PM with current project review grant. Check factual purchase, payer and evidence.',
          financial
            ? 'Owner/Finance completes the required classification and reimbursement review.'
            : 'Verify the expense review state. Direct reimbursement questions to the Owner.',
        ],
        [
          'Daily and Technical reports, including supplier profiles',
          'Owner or Finance; assigned PM with current project review grant and permitted project scope.',
          'Owner/Finance prepares the customer period report and version-bound acceptance where required.',
        ],
        [
          'PM’s own work',
          'Route it to another authorized reviewer for an independent factual check. Do not infer a universal self-review prohibition solely from a job title.',
          'Use the appropriate personal output and verify the review state.',
        ],
      ],
    },
    recovery: [
      'If the intended source is absent, check source type, state, dates, assignment/review grant and supplier authorization before searching another queue. A review-enabled Worker Chief variant is not exposed by the current role model; Owner must provision the genuinely permitted reviewer role and grant. Never use a colleague’s credentials to bypass this boundary.',
    ],
  };
  const recovery = {
    id: 'recovery-matrix',
    title: 'Recovery · sources, obligations and immutable history',
    paragraphs: [
      'Use the role’s worked correction lesson and the current record controls. A new purchase is different from a correction to an existing purchase. A payment reversal records a cash-entry correction; it does not amend a finalized compensation entitlement or unlock its time sources.',
    ],
    table: {
      headers: ['State', 'Supported next action'],
      rows: [
        [
          'Ordinary Draft',
          'Use Edit/Save draft where present; attach the actual receipt/evidence before Submit. Inspect each saved draft after weekly table entry.',
        ],
        [
          'Submitted',
          'Read current state and reviewer handoff. Do not create another source merely because review is pending.',
        ],
        [
          'Needs changes',
          'Read the reason. Time uses Create corrected draft where available, then submit/review the linked replacement. A returned Daily/Technical report instead offers Edit and Save changes on the same report, then Submit for review; follow the exact role lesson.',
        ],
        [
          'Rejected',
          'Inspect the reason and contact reviewer/Owner. The time detail does not offer the same linked-correction route as Needs changes; do not assume that route exists.',
        ],
        [
          'Approved, unlocked',
          'Use the offered linked correction, preserving the original. Re-review the replacement and refresh affected unissued drafts/report versions through their supported controls.',
        ],
        [
          'Issued, financially locked or finalized compensation',
          'Stop source editing. Send source ID/project/date, original/correct values, reason, affected invoice/settlement and payment references to Owner/Finance. If no authorized amendment control exists, escalate to platform support.',
        ],
      ],
    },
    recovery: [
      financial
        ? 'Finalized compensation has no ordinary Amend settlement or Unfinalize control in this release. Finance records the request and reconciles the preserved original obligation and actual payments; support must return a documented authorized financial resolution, resulting obligation/reference and explicit source-lock outcome. Until then the source remains blocked. A bank transfer, cash reversal or direct database edit is not an amendment procedure.'
        : 'For a finalized-compensation guard, send the exact source/date/reason and requested factual correction to Finance/Owner. Wait for a documented authorized resolution and explicit instruction about the source lock. Do not reverse a payment, change work dates or duplicate hours to evade the guard.',
    ],
  };
  const security = {
    id: 'security',
    title: 'Security · verify your own device and recovery options',
    route: 'Profile → Account security; Profile → Add availability',
    steps: [
      'Check Account security identifies YOUR account even when an authorized workforce profile inspection shows another worker above it. Enroll only your own device. MFA is optional in this release.',
      'For a passkey, enter Device name and choose Register passkey on the approved secure portal. Complete your device’s creation confirmation. Verify Passkey registered for this account, the registered count and named device row. Cancelled/failed registration is not enrollment.',
      'To retire your own lost/obsolete passkey, first confirm you retain another working sign-in method. Select Revoke on the exact device and verify Passkey revoked and removal of its row. If you cannot sign in, use the verified support route rather than another person’s session.',
      'For an authenticator, choose Enable MFA. Keep the setup URI and one-time recovery codes private in the approved password manager. Add the URI to your authenticator, enter its current six-digit Authenticator code and choose Verify MFA. Verify Enabled and Disable MFA appear; enabling without verification is not completed enrollment.',
      'At a later MFA sign-in use Six-digit code → Verify and continue. If the authenticator is unavailable, choose Use a recovery code and enter one unused stored code. If neither method is available, contact admin@j-aautomation.com for identity-verified recovery. Do not send recovery codes or the setup URI to support.',
      'To remove optional MFA while signed in, choose Disable MFA and verify Not enabled/Enable MFA. Confirm the intended own account before doing so. A successful settings change is separate from recovering a lost account.',
      'Where Add availability is offered, fill Starts, Ends, Availability and Note using the displayed time basis, then Save availability. Verify the saved interval/status/note in the list; use Edit availability on that row and save the changed values. Availability is not project membership, a published shift or actual hours.',
    ],
    figures: [
      figure(
        'security-mfa-enabled.png',
        'Isolated recipient’s authenticator setup was verified; the native Enabled state is shown after secret URI/recovery codes disappeared. No usable security material is published.',
      ),
    ],
  };
  const verification = {
    id: 'verification',
    title: 'Verification · current coverage and historical evidence',
    paragraphs: [
      'English readiness edition: 6 October 2026, based on repository abc12c0961b2 with the recorded readiness fixes. The publication receipt identifies the final commit and deployment. This edition teaches the permitted ordinary cycle and supported handoffs; it does not certify every contract, device or external service.',
      'The current evidence lives in docs/evidence/bbs-readiness-20261006. Its correction register maps all 72 suite findings to tasks, browser evidence or precise reference/support boundaries. Role manifests identify source IDs, state transitions and downloaded artifacts. Historical 5 October outputs remain historical; new screenshots do not rewrite their totals or private bytes.',
      'Recipient activation, actual authenticator verification and own passkey registration/revocation were exercised on a separate isolated recipient. The same account controls are shared, but enrollment was not repeated for every role or physical device. Offline/expired-link and lost-device paths remain precise references where not separately executed.',
      'Weekly submission was exercised with one ordinary draft and one eligible linked correction for Worker, Chief, External Technician and Supplier Coordinator: two selected drafts became two Submitted sources and zero remaining drafts. This does not guarantee that locked, withdrawn, out-of-scope or ineligible corrections will submit.',
      'A final Accounting cut succeeded in a separate clean Finance portfolio; an Auditor read and downloaded its outputs. Original BBS issuer-history and source-reconciliation blockers remain documented. Email transport, real bank movement, accountant approval and genuine customer acceptance are outside the synthetic tests.',
    ],
    checks: [
      'For a task described as reference, follow the exact named controls and prerequisites; do not infer that an illustrated outcome was executed. For support-only recovery, preserve the blocked source and obtain the documented receiving result before proceeding.',
    ],
  };
  return { before: [practice, access, trainer, review], after: [recovery, security, verification] };
}
