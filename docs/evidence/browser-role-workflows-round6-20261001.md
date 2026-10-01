# Browser QA target — 10 UX/UI improvements and 10 bug fixes

Started 2026-10-01 after deployed round 5. Count only new, distinct fixes: browser reproduction, implementation, affected-role browser regression, independent review and production activation. Prior-round fixes excluded; one issue never counts in both totals. GPT-6 Astra high is the user's requested independent counting judge. Functional testing uses only the browser; source/static/build/backup operations are engineering work. Credentials excluded.

## Progress

- UX/UI: 0/10 completed; ten Astra-approved candidates implemented, verification underway.
- Bugs: 0/10 completed; ten Astra-approved candidates implemented, verification underway.
- Latest constraint: one browser instance with one active page; roles switched sequentially. VPS reboot around 17:04 cleared earlier browser contexts and stopped preview. Production services recovered healthy on the unchanged round-5 release; preview restarted only after confirming its process was gone.

## Bugs

| ID | Issue / before evidence | Change | Current evidence |
|---|---|---|---|
| B01 | Live Worker1 approved round-5 report: dirty next-day plan/reason lost on Open project without a dialog | Shared correction-form dirty guard, internal navigation and native unload | Candidate Owner: Cancel retains both fields, disclosure reopens with values, confirmed discard navigates. Further roles/widths/save validation pending |
| B02 | Live Worker1 creates Daily from Technical tab, success leaves Technical filter with zero rows; switching Daily reveals the draft | Success navigates to the saved report type/project, Draft/newest filters and explicit notice | Candidate Worker1: Daily from Technical shows one new row and Daily report draft saved; no duplicate |
| B03 | Live Finance Non-billable(2) shows two Needs Finance classification rows, provisional defaults counted as decided treatment | Decided filters and counts require classified state | Candidate Owner: All(2), Needs(2), Reimbursable(0), Non-billable(0); Non-billable empty, Needs two |
| B04 | Live Finance switching inline expense editor silently loses unsaved reimbursement date | Protect expense switches, filters/search/sort/pages, route navigation and unload | Candidate Owner: Cancel preserves expense ID/date/reason on switch/filter/search; accept switches; clean planning save succeeds |
| B05 | Live expense billing_state unlocked labelled Actual client recovery state | Accurate Billing state caption and localized Unlocked label | Candidate Owner cards display Billing state Unlocked. Judge moved U05 to bug-only |

## UX/UI improvements

All below judged YES, one item each, by GPT-6 Astra high. Pending production activation and full after evidence; no completion quota credit yet.

| ID | Before / purpose | Implementation |
|---|---|---|
| U01 | Attachment daily_attachment / committed · not_scanned and ambiguous Version | Human attachment kind, separate storage/scan captions and attachment vs report version |
| U02 | Audit history raw JSON/IDs as primary content | Bounded readable date/reason/source-version/override summaries; original raw payload expandable and preserved |
| U03 | Approved report correction form 1773px/15 fields interrupts reading | Explicit collapsed Create corrected draft disclosure, inputs remain mounted; anchors/errors open it |
| U04 | Report title y925 at390, below PDF language inventory y284 | Identity/status first, compact optional multilingual inventory; primary PDF actions available |
| U06 | Finance expense cards only date/category/vendor/amount, no person or description | Authorized worker identity, description and Open expense source link |
| U07 | Owner360 project tabs scroll471/client304; Commercial right427 and Billing right499 outside viewport | Phone two-column full-label tabs, desktop unchanged; keyboard semantics retained |
| U08 | Login360 only Continue/passkey; no way to check typed password | Default-masked Show/Hide password, localized accessible button, preserved input and caret |

## Candidate browser evidence so far

Private raw directory `/home/kripta/ja-browser-round6-20261001`. Before screenshots: report-evidence-codes-before.png, approved-report-long-form-before.png, finance-nonbillable-unclassified-before.png, project-tabs-360-before.png. Correction retention after: report-correction-retained-after.png.

Candidate is an online production database/files snapshot on loopback5182, separate QA auth secret, no SMTP/jobs, offline disabled. No SQL functional assertions or API test scripts. New candidate daily report: QA ROUND6 candidate saved daily from Technical. Planning date2026-10-16 saved on candidate synthetic USD3 expense. Production records unchanged by candidate actions.

Global workspace typecheck passed after first group. Initial global lint log contains no diagnostics but completion handle was lost during VPS reboot; rerun required. Independent code review, remaining candidates, responsive/role regression, production build/backup/deployment and live verification pending.

## Deferred candidate

B06 (not counted): online warning when supported JA_OFFLINE_ENABLED=false is ignored by layout offlineEnabled. Browser saw warning on disabled preview; Astra requires documented supported configuration, captured natural identity request, and enabled/restricted-mode checks before credit. Current production flag is absent/enabled; do not claim this as a live incident.

## Added findings and urgent release scope

User2026-10-01 requested production deployment ASAP, GitHub push, removal of QA-prefixed projects, and invoice-ready billing streams on BBS Mexico and Junkers using existing data. The original10UX+10bugs goal stays active: this release has9 UX candidates and8 bugs, not20completeditems. Production activation and complete live regression are still required for completion credit.

- B06 judgedYES, configuration-specific: documented disabled-offline mode sends natural identity503 and falsewarning. Candidate corrected mode: noidentityrequest, nobanner. No claim this was a currentliveincident.
- B07 judgedYES: liveR6daily generated/downloadedv2PDF, Ownerreturnedreportv3, UIadvertisesReady/Download but servercorrectlyrejectsstale. RefreshagainshowsReady. Candidatecurrentv5 correctlyshowsSourcechanged/generatecurrentPDF, zeroDownloadlinks. Source revision currentnessis readonlymetadata; historicbytes/authorizationunchanged.
- B08 judgedYES: returnedreportdisappearsfromApprovals evenNeedschangesfilter. Same Owner/PMscopedpredicates nowincludereturnedoperationalrecords; candidateknownreportappearswithAwaitingauthorresubmission andzeroApprovebuttons. NoFinanceauthoritywidening.
- U09 judgedYES: commercialtimecategoryrequiredrawinputregular. Reusable nine-localized-choice selector +custom preservescodes andoptionalAnycategory. BrowserOvertimequerycategory=overtime andcustomqa_round6_custom_category preservedafterReviewterms.
- U10 judgedYES: liveSubmittedDailyR6andTechnical01a0f81e-9fe8-76ba-a1e4-a0669850c34d haveidenticalWorker1/date/projectcards. Addonlysafeoperationaltitleafterqueueauthorization, readabletype,titleandtitlesearch. Candidatebothcardscorrectlydistinguishable; allactionidsunchanged.

Candidateprojecttabs360/390/768/1440 allfullnamesinsideviewport,48pxheight,nopageoverflow. PasswordShow/Hidepreservesvalue,text/passwordtypes,aria-pressedandinputfocus. Initial scriptedloginattemptbeforehydration didnotcapturetoggle; stablehydratedcheckpassed. Failednativecorrection400retainsreasonandnowwarnswithoutfurtherediting.

Independentread-onlyreview/root/review_round6_release returnedSHIP aftertwo blockersfixed: rejectedcorrectioninitialDirtyandPDFasyncsourcegatingincludingpost-awaitretryfailure. Workspacepnpmtypecheckandlintpassed,finalfocusedtypecheck/lintpassed,diffcheckpassed. Fullsvelte-check additionallyreports58errorsin15files, largelyexistingtype/declarationissues; theneworiginalIdtypedaccesswasfixed. FullSveltecheckisnotclaimedgreen. Productionbuild/activationpending.

LiveR6reportnowSubmittedv5afterownerreturned,autosavedhandoverandresubmitted. TechnicalfixturecreatedoncebydblclickSave andSubmitted. OwnerliveBBSMexicoActive,USD,all-inhourlymodel10referencehours/day,0assignedteam/0actualtime,0reports. Project/data configurationinspectionongoing; noratesinvented.


## Production activation and urgent billing follow-up

Initial round-6 release activated successfully at 18:01:58 Europe/Madrid on 2026-10-01, commit `5cb15a0` pushed to `origin/codex/release-integration-20260928`. Archive SHA256 `660f374fe27fcb79788ea3efdf8f23b649ba7766a830867e200c249d4e6f6085`. Online backup `/var/backups/jaautomation/2026-10-01T160147205Z-fae5c323-127f-418d-af37-7a5a4095cf40`, ten documents, database SHA256 `c93c1783d555ff287f144f1201a3fe10bae90fbddeba49c88de362dde9554e88`. Portal/site builds, local/public health and jobs actor checks passed. Live R6 report correctly displays source-changed PDF warning, readable attachment metadata and audit summaries. Functional checks use one browser instance/page.

Owner archived all six QA-prefixed projects via the normal Closing → Closed → Archived lifecycle (one was already Closing). Audit/operational/financial history retained; archive is not a hard delete. QA USD billing stream archived separately and browser displays Archived with effective end 2026-10-01. BBS Mexico and Junkers OHIO remain Active, project edit drawer available. Docker unused build cache pruned: 8.432 GB reclaimed; no volumes or rollback images removed.

- **B09 — Astra BUG YES, one item:** live new billing stream offers BBS Mexico `project-cp020-bbs-mexico` and IMPC contact `contact-impc-hans-schwiedop`, but rejects both as invalid. UUID-only schema confirmed. Reuse existing bounded stored-ID schemas; repository role, currency, issuer and contact/project-client checks retained. Preview normal saves persist one BBS stream and one UUID Junkers stream, USD, manual cadence, J&A-USA issuer, existing contact and detailed labor template. No actual rates/hours invented.
- **B10 — Astra BUG YES, one item:** preview against existing production Junkers data, Sept12–26 invoice draft rejected with pending-approval guidance pointing to an empty Approvals queue. Time browser proves five Draft sources Sept12–16 and eight Approved Sept17–26. Readiness now distinguishes Draft/Needs changes as pending submission with Time/project/attention/date filters; submitted records retain approval guidance. Preview link exposes five drafts; after submitting Sept16 only on the isolated copy, Sept16 invoice attempt uses approval guidance and scoped Approvals shows that submitted record. Blocking and billing eligibility remain unchanged. Project detail uses the same recovery helper after independent review identified the missed caller.
- **U11 — Astra UX YES, one item:** stream creation shows only applicable cadence fields. Semi-monthly rule/help hidden for other cadences; anchor shown for weekly/every14/custom and required for every14. Mounted values retained; automatic draft flags unchanged. Preview all seven cadences display expected fields, manual phone/tablet/desktop checks and anchor retention verified.

Preview creates a Junkers draft for existing approved Sept17–26 sources totaling **USD 3,325.00**; no production source approvals changed. Full Sept12–26 correctly remains blocked by earlier unsubmitted drafts. Existing dataset has no tax profiles: no tax treatment fabricated; review before issuance remains required. New billing hotfix independent review SHIP after shared project-detail routing correction, applicable static checks pass; hotfix production activation and live stream configuration pending. Original10+10 completion credit remains pending full deployed regression; twenty distinct candidates now approved and implemented.


Follow-up release `54e2100` / SHA256 `ced83c50deb4d3826585db682c65948b8fe79bb00d1863af18c3446f560980a6` activated at18:36:37 Europe/Madrid. Backup `/var/backups/jaautomation/2026-10-01T163621250Z-bbca583d-964f-4bdc-85b7-0e46b615d506`,10documents,databaseSHA256 `368d4f8a6154c1843bfaf21a0b3640d2e9df8d080b98385d48acda6d9150a215`. Builds/public health/jobs pass; GitHub push succeeds. Build cache cleared again,5.087GB.

Live Owner saves BBS manual labor stream `01a0f853-db2e-772e-a519-16e92b21ebc0`, Junkers manual labor `01a0f853-ddf8-7198-9386-35b3fac859cb` and expense `01a0f853-e0c2-7794-b252-dcb6883e75f9`; USD/J&A-USA/existingIMPCcontact,project-start effective dates, detailed templates,automaticdraftdisabled,default30-dayterms. BBS all-in model keeps expenses included; no separate expense stream created. No tax profiles exist and none invented.

Live B10 failed Sept12–26 gives correct pending-submission guidance and Time link scoped to exact dates/project; browser exposes five Drafts, unchanged. Sept17–26 creates USD3,325.00 Junkers labor draft. Repeating period rebuilds the draft with a new ID while invoice register remains **one draft at the same total**, not two invoices. Latest observed draft `01a0f855-365a-742b-a6b8-9771065b4558`. No invoice issued/sent or real time approved. Preview shows existing customer $50 regular hourly rate and existing $0 overtime treatment; no rates changed.

Issuer setup: existing application invoice preview supplied J&A Automation LLC,112BirkshireDr,GeorgetownTX78626,USA. Owner records canonical revision `ce-legal-entity-revision-c8e0918d43fd0097c2efe41cd4a7e6e00880e5d2`,USD,America/Chicago,effectiveSept7,explicitreasonusingrecordedfacts; optional tax/registrationIDsblank. Junkers authority assignment saved fromSept12 with open end. BBS authority assignment then fails live ProjectInvalidUUID: another affected B09 path, **no new quota item** per Astra. One-line projectLegalEntityAssignmentInputSchema uses existing boundedprojectRecordIdSchema; canonical repository project/session/role/tenant/evidence checks unchanged. Latest online-snapshot preview saves BBS authority fromSept7; independentreviewSHIP, schema typecheck/lint pass. Final authority hotfix activation/live assignment pending.
