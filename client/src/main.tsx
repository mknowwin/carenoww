import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { SuperAdminProvider } from "./contexts/SuperAdminContext";
import { Toaster } from "./components/ui/toaster";
import { ConfirmDialog } from "./hooks/use-confirm";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuperAdminProvider>
        <AuthProvider>
          <App />
          <Toaster />
          <ConfirmDialog />
        </AuthProvider>
      </SuperAdminProvider>
    </QueryClientProvider>
  </StrictMode>
);
