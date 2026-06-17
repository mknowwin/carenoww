// ── API client — wraps fetch with auth headers and JSON parsing ───────────────

const BASE = "/api";

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("carenoww_user");
    if (stored) return JSON.parse(stored).token || null;
    const sa = localStorage.getItem("carenoww_superadmin");
    if (sa) return JSON.parse(sa).token || null;
  } catch {}
  return null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data as T;
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
    gstNo?: string; invoicePrefix?: string;
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
  metrics:     () => get<any>("/dashboard/metrics"),
  bedOccupancy:() => get<any>("/dashboard/bed-occupancy"),
  aiAlerts:    () => get<any>("/dashboard/ai-alerts"),
  revenueTrend:() => get<any>("/dashboard/revenue-trend"),
  deptVolume:  () => get<any>("/dashboard/dept-volume"),
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
  },
  batches: {
    list: (drugId?: string) => {
      const qs = drugId ? `?drugId=${encodeURIComponent(drugId)}` : "";
      return get<any[]>(`/pharmacy/batches${qs}`);
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

// ── Public (no auth) ──────────────────────────────────────────────────────────
export const publicApi = {
  display: (tenantId: string) =>
    fetch(`/api/public/display?tenantId=${encodeURIComponent(tenantId)}`).then((r) => r.json()),
};

export default { auth, superadmin, dashboard, patients, appointments, users, lab, pharmacy, billing, ratemaster, reports, ipd, prescriptions, publicApi };
