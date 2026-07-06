// ── API client — wraps fetch with auth headers and JSON parsing ───────────────

const BASE = "/api";

/** Typed error thrown by request() for both HTTP failures and network-level failures. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(message: string, opts: { statusCode: number; code: string; requestId?: string; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.details = opts.details;
  }
}

type AuthSource = "user" | "superadmin";

function getAuth(): { token: string; source: AuthSource } | null {
  try {
    const stored = localStorage.getItem("carenoww_user");
    if (stored) {
      const token = JSON.parse(stored).token;
      if (token) return { token, source: "user" };
    }
    const sa = localStorage.getItem("carenoww_superadmin");
    if (sa) {
      const token = JSON.parse(sa).token;
      if (token) return { token, source: "superadmin" };
    }
  } catch {}
  return null;
}

// Lets AuthContext / SuperAdminContext react to a 401 (clear session, redirect to
// login) without api.ts importing React context — avoids a circular dependency.
type UnauthorizedHandler = () => void;
const unauthorizedHandlers: Record<AuthSource, UnauthorizedHandler | null> = { user: null, superadmin: null };
export function registerUnauthorizedHandler(source: AuthSource, handler: UnauthorizedHandler | null) {
  unauthorizedHandlers[source] = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) headers["Authorization"] = `Bearer ${auth.token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Unable to reach the server. Check your connection.", { statusCode: 0, code: "NETWORK_ERROR" });
  }

  const headerRequestId = res.headers.get("X-Request-Id") ?? undefined;
  const data = await res.json().catch(() => ({} as any));

  if (!res.ok) {
    const code = data?.error?.code ?? "INTERNAL_ERROR";
    const message = data?.error?.message ?? data?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) unauthorizedHandlers[auth?.source ?? "user"]?.();
    throw new ApiError(message, {
      statusCode: res.status,
      code,
      requestId: data?.requestId ?? headerRequestId,
      details: data?.error?.details,
    });
  }

  // Backend responses are wrapped as {success: true, data}; unwrap so every
  // existing call site below keeps working against the same shape as before.
  return (data && data.success === true ? data.data : data) as T;
}

const get  = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put  = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT",  body: JSON.stringify(body) });
const del  = <T>(path: string) => request<T>(path, { method: "DELETE" });

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  login:           (email: string, password: string) => post<{ token: string; user: any }>("/auth/login", { email, password }),
  me:              () => get<any>("/auth/me"),
  changePassword:  (currentPassword: string, newPassword: string) =>
    post<{ message: string }>("/auth/change-password", { currentPassword, newPassword }),
  updateProfile:   (data: { name?: string; department?: string; aiScribeEnabled?: boolean; aiScribeProvider?: string; aiScribeApiKey?: string; aiScribeModel?: string }) =>
    put<any>("/auth/profile", data),
  getClinicSettings: () => get<any>("/auth/clinic-settings"),
  updateClinicSettings: (data: {
    name?: string; logoUrl?: string; clinicPhone?: string; clinicAddress?: string;
    gstNo?: string; invoicePrefix?: string; timezone?: string;
    taxConfig?: { cgstRate?: number; sgstRate?: number; igstRate?: number; taxInclusivePricing?: boolean };
  }) => put<any>("/auth/clinic-settings", data),
};

// ── Superadmin ────────────────────────────────────────────────────────────────
export const superadmin = {
  login:         (email: string, password: string) =>
    post<{ token: string; role: string; email: string }>("/superadmin/login", { email, password }),
  stats:         () => get<any>("/superadmin/stats"),
  listTenants:   (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/superadmin/tenants${qs}`);
  },
  getTenant:     (id: string) => get<any>(`/superadmin/tenants/${id}`),
  createTenant:  (data: any)  => post<any>("/superadmin/tenants", data),
  updateTenant:  (id: string, data: any) => put<any>(`/superadmin/tenants/${id}`, data),
  suspendTenant: (id: string) => post<any>(`/superadmin/tenants/${id}/suspend`, {}),
  activateTenant:(id: string) => post<any>(`/superadmin/tenants/${id}/activate`, {}),
  cancelTenant:  (id: string) => del<any>(`/superadmin/tenants/${id}`),
  getTenantUsers:(id: string) => get<any>(`/superadmin/tenants/${id}/users`),
  seedTenant:    (id: string) => post<any>(`/superadmin/tenants/${id}/seed`, {}),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboard = {
  metrics:      () => get<any>("/dashboard/metrics"),
  bedOccupancy: () => get<any>("/dashboard/bed-occupancy"),
  aiAlerts:     () => get<any>("/dashboard/ai-alerts"),
  revenueTrend: () => get<any>("/dashboard/revenue-trend"),
  deptVolume:   () => get<any>("/dashboard/dept-volume"),
  referralStats:(month?: string) => get<any[]>(`/dashboard/referral-stats${month ? `?month=${month}` : ""}`),
};

// ── Patients ──────────────────────────────────────────────────────────────────
export const patients = {
  list:   (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/patients${qs}`);
  },
  get:    (id: string) => get<any>(`/patients/${id}`),
  create: (data: any)  => post<any>("/patients", data),
  update: (id: string, data: any) => put<any>(`/patients/${id}`, data),
  remove: (id: string) => del<any>(`/patients/${id}`),
};

// ── Appointments ──────────────────────────────────────────────────────────────
export const appointments = {
  list:   (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/appointments${qs}`);
  },
  get:    (id: string) => get<any>(`/appointments/${id}`),
  create: (data: any)  => post<any>("/appointments", data),
  update: (id: string, data: any) => put<any>(`/appointments/${id}`, data),
  cancel: (id: string) => del<any>(`/appointments/${id}`),
  checkin:(id: string) => post<any>(`/appointments/${id}/checkin`, {}),
  call:   (id: string) => post<any>(`/appointments/${id}/call`, {}),
  queue:  (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/appointments/queue${qs}`);
  },
  slots:  (doctor: string, date: string) =>
    get<any>(`/appointments/slots?${new URLSearchParams({ doctor, date }).toString()}`),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = {
  list:       () => get<any>("/users"),
  get:        (id: string) => get<any>(`/users/${id}`),
  create:     (data: any)  => post<any>("/users", data),
  update:     (id: string, data: any) => put<any>(`/users/${id}`, data),
  deactivate: (id: string) => del<any>(`/users/${id}`),
  doctors:    (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/users/doctors${qs}`);
  },
};

// ── Lab ───────────────────────────────────────────────────────────────────────
export const lab = {
  list:   (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/lab/orders${qs}`);
  },
  get:    (id: string) => get<any>(`/lab/orders/${id}`),
  create: (data: any)  => post<any>("/lab/orders", data),
  update: (id: string, data: any) => put<any>(`/lab/orders/${id}`, data),
};

// ── Pharmacy ──────────────────────────────────────────────────────────────────
export const pharmacy = {
  orders: {
    list:   (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return get<any>(`/pharmacy/orders${qs}`);
    },
    create: (data: any)  => post<any>("/pharmacy/orders", data),
    update: (id: string, data: any) => put<any>(`/pharmacy/orders/${id}`, data),
  },
  inventory: {
    list:   (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return get<any>(`/pharmacy/inventory${qs}`);
    },
    create: (data: any)  => post<any>("/pharmacy/inventory", data),
    update: (id: string, data: any) => put<any>(`/pharmacy/inventory/${id}`, data),
    remove: (id: string) => del<any>(`/pharmacy/inventory/${id}`),
    reactivate: (id: string) => post<any>(`/pharmacy/inventory/${id}/reactivate`, {}),
    history: (id: string) => get<any>(`/pharmacy/inventory/${id}/history`),
    lowStock: async (filter?: "Low" | "Critical" | "both") => {
      const params: Record<string, string> = (!filter || filter === "both") ? { statusIn: "Low,Critical" } : { status: filter };
      params.limit = "1000";
      const data = await get<any>(`/pharmacy/inventory?${new URLSearchParams(params).toString()}`);
      return (data?.drugs ?? []) as any[];
    },
  },
  batches: {
    list: (drugId?: string) => {
      const qs = drugId ? `?drugId=${encodeURIComponent(drugId)}` : "";
      return get<any[]>(`/pharmacy/batches${qs}`);
    },
    expiryReport: (params?: { expiryWithin?: string; includeExpired?: string }) => {
      const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
      return get<any[]>(`/pharmacy/batches/expiry-report${qs}`);
    },
  },
  grn: {
    list:   (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return get<any>(`/pharmacy/grn${qs}`);
    },
    get:    (id: string) => get<any>(`/pharmacy/grn/${id}`),
    create: (data: any)  => post<any>("/pharmacy/grn", data),
    update: (id: string, data: any) => put<any>(`/pharmacy/grn/${id}`, data),
    cancel: (id: string) => del<any>(`/pharmacy/grn/${id}`),
  },
  adjustments: {
    list:   (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return get<any>(`/pharmacy/adjustments${qs}`);
    },
    create: (data: any)  => post<any>("/pharmacy/adjustments", data),
  },
};

// ── Billing ───────────────────────────────────────────────────────────────────
export const billing = {
  list:       (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/billing${qs}`);
  },
  get:        (id: string) => get<any>(`/billing/${id}`),
  create:     (data: any)  => post<any>("/billing", data),
  update:     (id: string, data: any) => put<any>(`/billing/${id}`, data),
  salesByStaff: (params?: { from?: string; to?: string }) => {
    const filtered = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>;
    const qs = Object.keys(filtered).length ? "?" + new URLSearchParams(filtered).toString() : "";
    return get<any[]>(`/billing/report/by-staff${qs}`);
  },
  // Payment
  postPayment:(id: string, data: any) => post<any>(`/billing/${id}/payments`, data),
  unlock:     (id: string) => post<any>(`/billing/${id}/unlock`, {}),
  // Insurance / claims
  preAuth:    (id: string, data: any) => post<any>(`/billing/${id}/pre-auth`, data),
  updatePreAuth:(id: string, data: any) => put<any>(`/billing/${id}/pre-auth`, data),
  fileClaim:  (id: string, data: any) => post<any>(`/billing/${id}/claim`, data),
  updateClaim:(id: string, data: any) => put<any>(`/billing/${id}/claim`, data),
};

// ── Service Rate Master ───────────────────────────────────────────────────────
export const ratemaster = {
  list:   (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any[]>(`/ratemaster${qs}`);
  },
  create: (data: any)  => post<any>("/ratemaster", data),
  update: (id: string, data: any) => put<any>(`/ratemaster/${id}`, data),
  remove: (id: string) => del<any>(`/ratemaster/${id}`),
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reports = {
  list:     (patientId?: string) => {
    const qs = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
    return get<any[]>(`/reports${qs}`);
  },
  download: (id: string) => get<{ fileData: string; fileName: string; fileType: string }>(`/reports/${id}/download`),
  upload:   (data: {
    patientId: string; patientName: string; appointmentId?: string;
    fileName: string; fileType: string; fileData: string; fileSize: number; notes: string;
  }) => post<any>("/reports", data),
  updateNotes: (id: string, notes: string) => put<any>(`/reports/${id}`, { notes }),
  remove:   (id: string) => del<any>(`/reports/${id}`),
};

// ── IPD ───────────────────────────────────────────────────────────────────────
export const ipd = {
  list:      (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any>(`/ipd${qs}`);
  },
  beds:      () => get<any>("/ipd/beds"),
  get:       (id: string) => get<any>(`/ipd/${id}`),
  admit:     (data: any)  => post<any>("/ipd", data),
  update:    (id: string, data: any) => put<any>(`/ipd/${id}`, data),
  addRound:  (id: string, data: any) => post<any>(`/ipd/${id}/rounds`, data),
  discharge: (id: string, data: any) => post<any>(`/ipd/${id}/discharge`, data),
  transfer:  (id: string, data: any) => post<any>(`/ipd/${id}/transfer`, data),
};

// ── Prescriptions ─────────────────────────────────────────────────────────────
export const prescriptions = {
  list:   (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return get<any[]>(`/prescriptions${qs}`);
  },
  create: (data: any) => post<any>("/prescriptions", data),
  update: (id: string, data: any) => put<any>(`/prescriptions/${id}`, data),
};

// ── Referral Doctors ──────────────────────────────────────────────────────────
export const referralDoctors = {
  search: (q: string) => get<any[]>(`/referral-doctors?search=${encodeURIComponent(q)}`),
  create: (data: { name: string; specialization?: string; phone?: string; hospital?: string }) =>
    post<any>("/referral-doctors", data),
};

// ── Suppliers ─────────────────────────────────────────────────────────────────
export const suppliers = {
  search: (q: string) => get<any[]>(`/suppliers?search=${encodeURIComponent(q)}`),
  create: (data: { name: string; phone?: string; email?: string; address?: string; gstNo?: string }) =>
    post<any>("/suppliers", data),
};

// ── Public (no auth) ──────────────────────────────────────────────────────────
export const publicApi = {
  display: (tenantId: string) => get<any>(`/public/display?tenantId=${encodeURIComponent(tenantId)}`),
};

export default { auth, superadmin, dashboard, patients, appointments, users, lab, pharmacy, billing, ratemaster, reports, ipd, prescriptions, publicApi, referralDoctors, suppliers };
