# Error Handling & Logging

Centralized error handling, structured logging, and a standard response envelope for the Carenoww API and frontend.

## 1. Overview

Every API response follows one of two shapes:

```jsonc
// Success
{ "success": true, "data": { /* ... */ } }

// Failure
{
  "success": false,
  "requestId": "b3f1c2a4-...",
  "error": { "code": "VALIDATION_ERROR", "message": "Please correct the highlighted fields.", "details": [...] }
}
```

`requestId` correlates a client-visible failure with the server log line and the persisted `ErrorLog` document for that request — use it when a user reports "something went wrong."

## 2. Request flow

```
requestIdMiddleware        → assigns req.requestId, sets X-Request-Id response header
helmet / cors / rate-limit
express.json / urlencoded
routers (server/routes/*)  → thin controllers: parse req, call a service, wrap response
  └─ services (server/services/*) → business logic, throws AppError on failure
notFoundHandler             → unmatched /api/* paths become AppError("ROUTE_NOT_FOUND")
errorHandler                → normalizes any error, logs + persists it, sends the envelope
```

`errorHandler` is the last middleware registered in `server/index.ts`. Anything thrown or rejected inside an `asyncHandler`-wrapped route (or forwarded via `next(err)`) ends up there.

## 3. Error codes

Defined once in `shared/types.ts` (`ErrorCode` union) and given a default HTTP status + safe message in `server/lib/errorCodes.ts`:

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad input (manual check or Mongoose `ValidationError`) |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing/invalid credentials |
| `INVALID_TOKEN` / `TOKEN_EXPIRED` | 401 | JWT rejected |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | A specific resource is missing |
| `ROUTE_NOT_FOUND` | 404 | The URL doesn't map to any route |
| `CONFLICT` / `DUPLICATE_KEY` | 409 | Business conflict / unique-index violation |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` / `DB_ERROR` | 500 | Unexpected failure |
| `NETWORK_ERROR` | — | Frontend-only: `fetch` itself failed (no response) |

## 4. Backend usage

```ts
// server/services/patientService.ts
import { AppError } from "../lib/AppError.js";

export async function getPatient(tenantId: string, id: string) {
  const patient = await Patient.findOne({ _id: id, tenantId });
  if (!patient) throw AppError.notFound("Patient not found");
  return patient;
}
```

```ts
// server/routes/patients.ts
router.get("/:id", asyncHandler(async (req: AuthRequest, res) => {
  const patient = await patientService.getPatient(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: patient });
}));
```

- **`asyncHandler`** (`server/lib/asyncHandler.ts`) wraps a route so a thrown error / rejected promise goes to `next(err)` — no `try/catch` needed in routes.
- **`AppError`** (`server/lib/AppError.ts`) is the only error type routes/services should throw deliberately. Static helpers: `.badRequest()`, `.validation()`, `.unauthorized()`, `.forbidden()`, `.notFound()`, `.conflict()`, `.internal()`.
- Anything else thrown (a raw `Error`, Mongoose `ValidationError`/`CastError`, a MongoDB duplicate-key error, a JSON parse error) is normalized automatically by `AppError.fromUnknown` inside `errorHandler` — no special handling needed at the call site.
- Routes are thin controllers only: parse `req`, call the matching function in `server/services/<domain>Service.ts`, wrap the return value as `{ success: true, data }`. All Mongoose queries and business rules live in the service module.

## 5. Frontend usage

`client/src/lib/api.ts`'s `request()` throws a typed `ApiError` (`message`, `statusCode`, `code`, `requestId?`, `details?`) for both HTTP failures and network-level failures (`code: "NETWORK_ERROR"`). Success responses are unwrapped (`data.data`) before being returned, so existing call sites (`patients.list()`, `appointments.get()`, etc.) are unaffected by the envelope.

```ts
import { ApiError } from "@/lib/api";

try {
  await patients.create(payload);
} catch (e) {
  if (e instanceof ApiError && e.code === "VALIDATION_ERROR") {
    // e.details has per-field messages
  }
}
```

- A global toast fires automatically for any failed `useQuery`/`useMutation` (wired via `QueryCache`/`MutationCache` `onError` in `client/src/main.tsx`), showing the message plus a short reference id. Opt out per call with `useQuery({ ..., meta: { silent: true } })`.
- A 401 response triggers the registered handler for that auth source (`registerUnauthorizedHandler`, wired in `AuthContext`/`SuperAdminContext`), which clears the session and shows a "Session expired" toast; the existing route guards in `App.tsx` then redirect to the login page.
- `AppErrorBoundary` (`client/src/components/AppErrorBoundary.tsx`) catches render-time crashes and shows a "Something went wrong" panel with a local reference id. It wraps each protected route and the app root.

## 6. Logging & the `ErrorLog` collection

`server/lib/logger.ts` writes structured JSON to the console (`fatal`/`error`/`warn`/`info`) and, for errors reaching `errorHandler`, persists an `ErrorLog` document (`server/models/ErrorLog.ts`) with `tenantId` (optional), `requestId`, `userId`, `module`, `api`, `method`, `statusCode`, `errorCode`, `message`, `stack`, `payload`/`params`/`query`, `ipAddress`, `userAgent`, `environment`.

Before logging or persisting, `server/lib/maskSensitiveData.ts` recursively redacts any key named (case-insensitive) `password`, `confirmPassword`, `token`, `refreshToken`, `otp`, `accessToken`, `apiKey`, `secret`, or `cardNumber` — replacing the value with `"***REDACTED***"`.

Query examples (Mongo shell):

```js
db.errorlogs.find({ requestId: "..." })
db.errorlogs.find({ tenantId: ObjectId("...") }).sort({ createdAt: -1 }).limit(20)
db.errorlogs.find({ statusCode: { $gte: 500 } }).sort({ createdAt: -1 })
```

## 7. Adding a new error code

1. Add the string to the `ErrorCode` union in `shared/types.ts`.
2. Add its HTTP status to `ERROR_STATUS` and its default message to `ERROR_MESSAGES` in `server/lib/errorCodes.ts`.
3. Throw it with `new AppError("YOUR_CODE", { message, details })` (or add a static helper on `AppError` if it'll be reused often).
