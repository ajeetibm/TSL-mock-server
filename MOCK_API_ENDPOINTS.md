# TSL Mock API Endpoints

Generated from `TSL_API_Request_Response.docx`.

Base URL: `http://localhost:8080`

Dynamic path params from the API spec are stored as `__` folders. Example: `/api/v1/sme/workflows/wf_009/status` resolves to `mocks/api/v1/sme/workflows/__/status/GET.mock`.

| Code | Method | Endpoint | Mock File | Success Response |
| --- | --- | --- | --- | --- |
| AUTH-001 | POST | `/api/v1/auth/register` | `mocks/api/v1/auth/register/POST.mock` | 201 Created Account created successfully |
| AUTH-002 | POST | `/api/v1/auth/login` | `mocks/api/v1/auth/login/POST.mock` | 200 OK Login successful |
| AUTH-003 | POST | `/api/v1/auth/forgot-password` | `mocks/api/v1/auth/forgot-password/POST.mock` | 200 OK Reset email sent |
| AUTH-004 | POST | `/api/v1/auth/reset-password` | `mocks/api/v1/auth/reset-password/POST.mock` | 200 OK Password reset successful |
| AUTH-005 | POST | `/api/v1/auth/google` | `mocks/api/v1/auth/google/POST.mock` | 200 OK Existing account authenticated |
| SME-001 | GET | `/api/v1/sme/dashboard` | `mocks/api/v1/sme/dashboard/GET.mock` | 200 OK Dashboard data returned |
| SME-002 | GET | `/api/v1/sme/workflows/:workflowId/download` | `mocks/api/v1/sme/workflows/__/download/GET.mock` | 200 OK File download initiated |
| WIZ-001 | GET | `/api/v1/wizards` | `mocks/api/v1/wizards/GET.mock` | 200 OK Wizard list returned |
| WIZ-002 | POST | `/api/v1/sme/wizards/:wizardId/start` | `mocks/api/v1/sme/wizards/__/start/POST.mock` | 201 Created Wizard session started |
| WIZ-003 | PUT | `/api/v1/sme/workflows/:workflowId/steps/:stepNumber` | `mocks/api/v1/sme/workflows/__/steps/__/PUT.mock` | 200 OK Step saved successfully |
| WIZ-004 | POST | `/api/v1/sme/workflows/:workflowId/generate` | `mocks/api/v1/sme/workflows/__/generate/POST.mock` | 202 Accepted Generation job queued |
| WIZ-005 | GET | `/api/v1/sme/workflows/:workflowId/status` | `mocks/api/v1/sme/workflows/__/status/GET.mock` | 200 OK Status returned |
| COU-001 | GET | `/api/v1/sme/counsel/credits` | `mocks/api/v1/sme/counsel/credits/GET.mock` | 200 OK Credits returned |
| COU-002 | POST | `/api/v1/sme/counsel/requests` | `mocks/api/v1/sme/counsel/requests/POST.mock` | 201 Created Request submitted successfully |
| COU-003 | GET | `/api/v1/sme/counsel/requests` | `mocks/api/v1/sme/counsel/requests/GET.mock` | 200 OK Request history returned |
| NOT-001 | GET | `/api/v1/sme/notifications` | `mocks/api/v1/sme/notifications/GET.mock` | 200 OK Notifications returned |
| NOT-002 | PATCH | `/api/v1/sme/notifications/:notificationId/read` | `mocks/api/v1/sme/notifications/__/read/PATCH.mock` | 200 OK Notification marked as read |
| NOT-003 | POST | `/api/v1/sme/notifications/read-all` | `mocks/api/v1/sme/notifications/read-all/POST.mock` | 200 OK All notifications marked as read |
| NOT-004 | PUT | `/api/v1/sme/notifications/preferences` | `mocks/api/v1/sme/notifications/preferences/PUT.mock` | 200 OK Preferences saved |
| BIL-001 | GET | `/api/v1/sme/billing` | `mocks/api/v1/sme/billing/GET.mock` | 200 OK Billing data returned |
| BIL-002 | GET | `/api/v1/sme/billing/payment-methods` | `mocks/api/v1/sme/billing/payment-methods/GET.mock` | 200 OK Payment methods returned |
| BIL-003 | POST | `/api/v1/sme/billing/payment-methods` | `mocks/api/v1/sme/billing/payment-methods/POST.mock` | 201 Created Payment method added |
| PRO-001 | PUT | `/api/v1/sme/profile` | `mocks/api/v1/sme/profile/PUT.mock` | 200 OK Profile updated |
| PRO-002 | PUT | `/api/v1/auth/change-password` | `mocks/api/v1/auth/change-password/PUT.mock` | 200 OK Password changed successfully |
| ADM-001 | GET | `/api/v1/admin/dashboard` | `mocks/api/v1/admin/dashboard/GET.mock` | 200 OK Dashboard data returned |
| ADM-002 | GET | `/api/v1/admin/users` | `mocks/api/v1/admin/users/GET.mock` | 200 OK User list returned |
| ADM-003 | PUT | `/api/v1/admin/users/:userId` | `mocks/api/v1/admin/users/__/PUT.mock` | 200 OK User updated |
| ADM-004 | POST | `/api/v1/admin/admins/invite` | `mocks/api/v1/admin/admins/invite/POST.mock` | 201 Created Invitation sent |
| ADM-005 | DELETE | `/api/v1/admin/admins/:adminId` | `mocks/api/v1/admin/admins/__/DELETE.mock` | 200 OK Access revoked |
| ADM-007 | GET | `/api/v1/admin/counsel` | `mocks/api/v1/admin/counsel/GET.mock` | 200 OK Counsel directory returned |
| ADM-008 | POST | `/api/v1/admin/counsel` | `mocks/api/v1/admin/counsel/POST.mock` | 201 Created Counsel created and email sent |
| ADM-006 | POST | `/api/v1/admin/counsel-requests/:requestId/assign` | `mocks/api/v1/admin/counsel-requests/__/assign/POST.mock` | 200 OK Request assigned successfully |
| ADM-009 | GET | `/api/v1/admin/issues` | `mocks/api/v1/admin/issues/GET.mock` | 200 OK Issues returned |
| ADM-010 | GET | `/api/v1/admin/billing` | `mocks/api/v1/admin/billing/GET.mock` | 200 OK Billing data returned |
| CON-001 | GET | `/api/v1/counsel/dashboard` | `mocks/api/v1/counsel/dashboard/GET.mock` | 200 OK Counsel dashboard returned |
| CON-002 | PATCH | `/api/v1/counsel/availability` | `mocks/api/v1/counsel/availability/PATCH.mock` | 200 OK Availability updated |
| CON-003 | POST | `/api/v1/counsel/requests/:requestId/accept` | `mocks/api/v1/counsel/requests/__/accept/POST.mock` | 200 OK Request accepted and email sent |
| CON-004 | POST | `/api/v1/counsel/requests/:requestId/reject` | `mocks/api/v1/counsel/requests/__/reject/POST.mock` | 200 OK Request rejected |
| CON-005 | GET | `/api/v1/counsel/requests` | `mocks/api/v1/counsel/requests/GET.mock` | 200 OK Requests list returned |
| CON-006 | PUT | `/api/v1/counsel/profile` | `mocks/api/v1/counsel/profile/PUT.mock` | 200 OK Profile updated |
| CON-007 | POST | `/api/v1/counsel/reset-password` | `mocks/api/v1/counsel/reset-password/POST.mock` | 200 OK Counsel password reset successful |
| PLY-001 | GET | `/api/v1/playbooks` | `mocks/api/v1/playbooks/GET.mock` | 200 OK Playbooks returned |
| DOC-001 | GET | `/api/v1/documents` | `controllers/document.controller.js` | 200 OK Document list returned (filterable by `?category=legal\|compliance\|guide\|template`). Each record includes a `url` field (root-relative path e.g. `/assets/pdfs/popia-compliance-basics.pdf`) served by `express.static`. |
| DOC-002 | GET | `/api/v1/documents/:documentId` | `controllers/document.controller.js` | 200 OK Single document metadata + `url` pointing to locally-served PDF at `http://localhost:8080/assets/pdfs/<filename>`. In production this would be a presigned cloud-storage URL. |
| DOC-003 | GET | `/assets/pdfs/:filename` | `assets/pdfs/` (static) | 200 OK Raw PDF bytes served directly by `express.static`. Use the `url` from DOC-001/DOC-002 to construct this request. |
