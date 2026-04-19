# Pull Request: Frontend Unit Tests & Toast Notifications

## Summary

Adds proactive toast notifications for inspection job status changes, and introduces a full unit test suite covering all 13 frontend requirements.

---

## What changed

### Toast notification system

Users previously had to watch the sidebar to notice when a job finished. Now a toast notification slides in from the bottom-right automatically when a job status changes.

| Trigger | Toast |
|---------|-------|
| Image uploaded and queued | ℹ️ "Inspection submitted" (info) |
| Job completes — PASS | ✅ "Inspection complete — PASS" (success) |
| Job completes — FAIL | ❌ "Inspection failed — FAIL" (error) |
| Job times out | ⚠️ "Inspection timed out" (warning) |
| Job hits an error | ❌ "Inspection error" (error) |

Toasts auto-dismiss after 5 seconds. The X button dismisses immediately with a slide-out animation. No toast fires for existing history on page load — only for transitions that happen while the user is on the page.

### Status transition detection

`useInspectionHistory` already polled the backend every 3 seconds. An optional `onStatusChange` callback was added that fires when a submission's status changes between polls. A `prevStatuses` ref map tracks the last-seen status per submission ID, and an `isInitialized` guard prevents callbacks from firing on the first load.

### Slide animation

Toasts slide in from the right on appear and slide out to the right on dismiss, using CSS `@keyframes`. The exit animation plays for 200ms before the element is removed from the DOM.

### Unit tests — 79 tests, all passing

| Test file | Requirements covered | Tests |
|-----------|---------------------|-------|
| `login.test.tsx` | Req 1 (login UI), Req 11 (failed login notification) | 9 |
| `inspect-upload.test.tsx` | Req 2 (upload feature), Req 4 (multiple images) | 12 |
| `projects.test.tsx` | Req 3 (multiple design specs), Req 12 (group by project), Req 13 (create projects) | 14 |
| `result.test.tsx` | Req 5 (view reports), Req 6 (past FOD classifications), Req 7 (grouped by project) | 15 |
| `useInspectionHistory.test.ts` | Req 8 (notify complete), Req 9 (notify active), Req 10 (notify failed) | 9 |
| `toast.test.tsx` | Toast UI components | 9 |
| `ToastContext.test.tsx` | Toast context / useToast hook | 7 |

Run with: `cd frontend && npm test`

---

## Files

### New files

| File | Purpose |
|------|---------|
| `frontend/src/components/ui/toast.tsx` | `ToastItem` and `ToastContainer` UI components; variant icons (success/error/warning/info) |
| `frontend/src/context/ToastContext.tsx` | `ToastProvider` context and `useToast()` hook; 5s auto-dismiss; 220ms exit-animation delay before DOM removal |
| `frontend/src/__tests__/toast.test.tsx` | Unit tests for `ToastItem` and `ToastContainer` |
| `frontend/src/__tests__/ToastContext.test.tsx` | Unit tests for `ToastProvider` / `useToast` |
| `frontend/src/__tests__/useInspectionHistory.test.ts` | Unit tests for status transition detection (Req 8–10) |
| `frontend/src/__tests__/login.test.tsx` | Unit tests for login page (Req 1, 11) |
| `frontend/src/__tests__/inspect-upload.test.tsx` | Unit tests for upload page (Req 2, 4) |
| `frontend/src/__tests__/projects.test.tsx` | Unit tests for projects page (Req 3, 12, 13) |
| `frontend/src/__tests__/result.test.tsx` | Unit tests for inspect result page (Req 5, 6, 7) |
| `frontend/vitest.config.ts` | Vitest configuration (jsdom environment, `@` path alias) |
| `frontend/vitest.setup.ts` | Global test setup: imports `@testing-library/jest-dom` matchers |

### Modified files

| File | Change |
|------|--------|
| `frontend/src/hooks/useInspectionHistory.ts` | Added `StatusChangeEvent` type and optional `onStatusChange` callback; `prevStatuses` ref and `isInitialized` guard for transition detection |
| `frontend/src/components/InspectHistorySidebar.tsx` | Wired `useToast` + `handleStatusChange` into `useInspectionHistory`; fires toasts on job status transitions |
| `frontend/src/app/ClientRoot.tsx` | Wrapped app with `<ToastProvider>` |
| `frontend/src/app/globals.css` | Added `@keyframes toast-in` / `toast-out` and `.toast-enter` / `.toast-exit` for slide animations |
| `frontend/package.json` | Added `test` / `test:watch` scripts; added Vitest and Testing Library dev dependencies |
| `frontend/package-lock.json` | Lockfile updated for new test dependencies |
