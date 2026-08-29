import { useState } from "react";
import { Users, Heart, IndianRupee, Share2 } from "lucide-react";
import ClinicalVolumeReports from "./ClinicalVolumeReports";
import CardiologyReport from "./CardiologyReport";
import BillingCashReports from "./BillingCashReports";
import ReferralReports from "./ReferralReports";

const CLUSTERS = [
  { id: "clinical", label: "Clinical Volume", icon: Users },
  { id: "cardiology", label: "Cardiology Investigations", icon: Heart },
  { id: "billing", label: "Billing & Cash", icon: IndianRupee },
  { id: "referrals", label: "Referrals", icon: Share2 },
] as const;

export default function InsightsTab() {
  const [cluster, setCluster] = useState<typeof CLUSTERS[number]["id"]>("clinical");

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {CLUSTERS.map((c) => (
          <button key={c.id} onClick={() => setCluster(c.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              cluster === c.id ? "bg-teal-700 text-white border-teal-700 shadow-sm" : "border-border text-muted-foreground hover:border-teal-400 hover:text-foreground"
            }`}>
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
      </div>

      {cluster === "clinical" && <ClinicalVolumeReports />}
      {cluster === "cardiology" && <CardiologyReport />}
      {cluster === "billing" && <BillingCashReports />}
      {cluster === "referrals" && <ReferralReports />}
    </div>
  );
}
