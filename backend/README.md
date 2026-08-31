# BUILDSIGMA API

Minimal TypeScript Express service for BUILDSIGMA.

## Security model

| Route | Access |
| --- | --- |
| `GET /health` | Public |
| `/api/*` | Requires Firebase ID token: `Authorization: Bearer <token>` |

Authorization:

- `Project.ownerUid` is the authoritative ownership field (set server-side from the authenticated UID).
- Child resources (`planItems`, `measurements`, `deltas`) authorize through their `projectId` → owned Project.
- Missing/invalid identity → `401 Unauthorized`
- Missing or foreign resources → `404` (does not reveal another user's data)
- Cloud Run remains `--allow-unauthenticated`; Firebase tokens are verified in the app layer.
- Runtime service account: `buildsigma-api-runtime@buildsigma-olivier-2026.iam.gserviceaccount.com`
- Runtime IAM: `roles/datastore.user` only

## Project identity

| Field | Meaning |
| --- | --- |
| `Project.id` | Remote canonical Firestore document ID (tenant-safe) |
| `Project.localProjectId` | Originating client/local ID (e.g. `project-001`) |
| `Project.ownerUid` | Firebase authenticated owner |

Remote IDs are generated server-side as:

`createRemoteProjectId(uid, localProjectId)` → `` `${uid}_${localProjectId}` ``

Bootstrap (`POST /api/projects/bootstrap`) is idempotent for the authenticated user (`201` created / `200` already exists). Mobile AsyncStorage still uses local IDs; mapping to remote IDs is client-side and user-scoped.

## PlanItem identity

| Field | Meaning |
| --- | --- |
| `PlanItem.id` | Remote canonical Firestore document ID (tenant-safe) |
| `PlanItem.localPlanItemId` | Originating client/local ID (e.g. `plan-001`) |
| `PlanItem.projectId` | Remote Project ID |

Remote PlanItem IDs are generated server-side as:

`createRemotePlanItemId(remoteProjectId, localPlanItemId)` → `` `${remoteProjectId}_${localPlanItemId}` ``

Bootstrap:

```http
POST /api/projects/:projectId/plan-items/bootstrap
```

Idempotent for the authenticated owner of `:projectId`. Response:

`{ created, existing, items }`

## Measurement identity

| Field | Meaning |
| --- | --- |
| `Measurement.id` | Remote canonical Firestore document ID (tenant-safe) |
| `Measurement.localMeasurementId` | Originating client/local ID |
| `Measurement.projectId` | Remote Project ID |
| `Measurement.planItemId` | Remote PlanItem ID |

Remote Measurement IDs are generated server-side as:

`createRemoteMeasurementId(remoteProjectId, localMeasurementId)` → `` `${remoteProjectId}_${localMeasurementId}` ``

Bootstrap:

```http
POST /api/projects/:projectId/measurements/bootstrap
```

Resolves PlanItems from `localPlanItemId` via deterministic remote PlanItem IDs. Response:

`{ created, existing, items }`

## Delta identity

| Field | Meaning |
| --- | --- |
| `Delta.id` | Remote canonical Firestore document ID (tenant-safe) |
| `Delta.localDeltaId` | Originating client/local Delta ID |
| `Delta.projectId` | Remote Project ID |
| `Delta.planItemId` | Remote PlanItem ID |
| `Delta.measurementId` | Remote Measurement ID |

Remote Delta IDs are generated server-side as:

`createRemoteDeltaId(remoteProjectId, localDeltaId)` → `` `${remoteProjectId}_${localDeltaId}` ``

Bootstrap:

```http
POST /api/projects/:projectId/deltas/bootstrap
```

Resolves PlanItem + Measurement from local IDs; validates cross-resource consistency. Create-or-get only (no review-status overwrite). Response:

`{ created, existing, items }`

Review status sync:

```http
PATCH /api/projects/:projectId/deltas/:deltaId/review
```

- Authenticated, owner-only
- Idempotent
- Only transition: `open` → `reviewed`
- Mobile review is local-first; cloud update is best-effort

## Local development

```bash
cd backend
npm install
npm run dev
```

```bash
curl http://localhost:8080/health
curl -i http://localhost:8080/api/projects
curl -i -H "Authorization: Bearer $FIREBASE_ID_TOKEN" http://localhost:8080/api/projects
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Hot reload |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run production build |
| `npm run firestore:smoke` | Firestore write/read/cleanup |
| `npm run api:cleanup` | Delete disposable `api-test-*` docs |
| `npm run auth:ensure-users` | Create/reuse Email/Password test users (passwords via env) |
| `npm run auth:cleanup` | Delete disposable auth-test docs |

## Environment

See `.env.example`:

```bash
PORT=8080
```

For test-user creation only (never commit):

```bash
BUILDSIGMA_TEST_PASSWORD_A=...
BUILDSIGMA_TEST_PASSWORD_B=...
FIREBASE_WEB_API_KEY=...
```

Do not place credentials, Firebase private keys, or AI keys in the repository.
