# Browser QA target — 10 UX/UI improvements and 10 bug fixes

Started 2026-10-01 after deployed round 5. Count only new, distinct fixes: browser reproduction, implementation, affected-role browser regression, independent review and production activation. Prior-round fixes excluded; one issue never counts in both totals. GPT-6 Astra high is the user's requested independent counting judge. Functional testing uses only the browser; source/static/build/backup operations are engineering work. Credentials excluded.

## Progress

- UX/UI: 0/10 completed; nine Astra-approved candidates implemented, verification underway.
- Bugs: 0/10 completed; eight Astra-approved candidates implemented, verification underway.
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
