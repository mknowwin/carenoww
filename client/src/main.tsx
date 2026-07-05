import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { SuperAdminProvider } from "./contexts/SuperAdminContext";
import { Toaster } from "./components/ui/toaster";
import { ConfirmDialog } from "./hooks/use-confirm";
import { toastApiError } from "./lib/errorToast";
import AppErrorBoundary from "./components/AppErrorBoundary";
import App from "./App";
import "./index.css";

// Global error toast for any query/mutation that doesn't set meta:{silent:true}
// to handle its own error UI. Centralizes error surfacing instead of each page
// duplicating its own try/catch + toast.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
  queryCache: new QueryCache({
    onError: (err, query) => { if (!query.meta?.silent) toastApiError(err); },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => { if (!mutation.meta?.silent) toastApiError(err); },
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuperAdminProvider>
        <AuthProvider>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
          <Toaster />
          <ConfirmDialog />
        </AuthProvider>
      </SuperAdminProvider>
    </QueryClientProvider>
  </StrictMode>
);
