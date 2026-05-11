import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BedDouble, Plus, AlertTriangle, Clock, CheckCircle2, Brain,
  Activity, FileText, LogOut,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { patients as patientsApi, dashboard as dashApi } from "@/lib/api";
import { PATIENTS as PATIENTS_FB, BED_OCCUPANCY as BEDS_FB } from "@/lib/mock-data";
import PatientModal from "@/components/modals/PatientModal";

const NURSING_CHECKS = [
  { patient: "Lakshmi Devi",  task: "Vitals 6AM",        done: true,  time: "06:00" },
  { patient: "Lakshmi Devi",  task: "Medication Round",   done: true,  time: "08:00" },
  { patient: "Preethi Raj",   task: "CTG Monitoring",     done: true,  time: "09:00" },
  { patient: "Ramesh Babu",   task: "Wound Dressing",     done: false, time: "10:00" },
  { patient: "Suresh Kumar",  task: "Dialysis Setup",     done: false, time: "10:30" },
  { patient: "Preethi Raj",   task: "NST — Afternoon",    done: false, time: "14:00" },
];

const WARD_SUMMARY = [
  { ward: "Cardiology", floor: "3rd", beds: 20, occupied: 17, patients: ["Ramesh Babu", "Arjun Mehta (OPD)"] },
  { ward: "Ortho",      floor: "2nd", beds: 15, occupied: 12, patients: ["Lakshmi Devi"] },
  { ward: "Obs/Gyn",    floor: "4th", beds: 12, occupied: 8,  patients: ["Preethi Raj"] },
  { ward: "Nephro",     floor: "3rd", beds: 10, occupied: 9,  patients: [] },
  { ward: "ICU",        floor: "2nd", beds: 20, occupied: 17, patients: ["Suresh Kumar"] },
];

export default function IPDPage() {
  const qc = useQueryClient();
  const [admitModalOpen, setAdmitModalOpen] = useState(false);
  const [discharging, setDischarging] = useState<string | null>(null);

  const { data: pData }   = useQuery({ queryKey: ["patients-ipd"], queryFn: () => patientsApi.list({ status: "IPD",  limit: "100" }), retry: false });
  const { data: icuData } = useQuery({ queryKey: ["patients-icu"], queryFn: () => patientsApi.list({ status: "ICU",  limit: "100" }), retry: false });
  const { data: bedsData } = useQuery({ queryKey: ["bed-occupancy"], queryFn: dashApi.bedOccupancy, retry: false });

  const discharge = async (p: any) => {
    if (!confirm(`Discharge ${p.name}?`)) return;
    setDischarging(p.id);
    try {
      await patientsApi.update(p._id || p.id, { status: "Discharged" });
      qc.invalidateQueries({ queryKey: ["patients-ipd"] });
      qc.invalidateQueries({ queryKey: ["patients-icu"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
    } finally {
      setDischarging(null);
    }
  };

  const ipdPatients: any[] = [
    ...(pData?.patients ?? PATIENTS_FB.filter((p) => p.status === "IPD")),
    ...(icuData?.patients ?? PATIENTS_FB.filter((p) => p.status === "ICU")),
  ].map((p) => ({ ...p, id: p.uhid || p._id || p.id }));

  const BED_OCCUPANCY: any[] = bedsData ?? BEDS_FB;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">IPD & Ward Management</h2>
          <p className="text-sm text-muted-foreground">{(pData?.total ?? 0) + (icuData?.total ?? 0) || ipdPatients.length} inpatients active · AI Early Warning active</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><BedDouble className="h-4 w-4" /> Bed Transfer</Button>
          <Button size="sm" className="gap-2" onClick={() => setAdmitModalOpen(true)}><Plus className="h-4 w-4" /> New Admission</Button>
        </div>
      </div>

      {/* AI EWS Alert */}
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 animate-pulse" />
        <div className="flex-1">
          <p className="text-sm text-red-700">
            <span className="font-semibold">AI Early Warning Score — CRITICAL:</span> Suresh Kumar (ICU) — EWS 7, qSOFA 3. Sepsis signature detected. Immediate physician review required.
          </p>
        </div>
        <Button size="sm" variant="destructive" className="shrink-0">Review Now</Button>
      </div>

      {/* Bed overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {BED_OCCUPANCY.map((ward: any) => {
          const pct = Math.round((ward.occupied / ward.total) * 100);
          const isRed = pct >= 90;
          return (
            <Card key={ward.ward} className={isRed ? "border-red-200 bg-red-50" : ""}>
              <CardContent className="p-3 text-center">
                <div className={`text-2xl font-bold ${isRed ? "text-red-600" : "text-foreground"}`}>{ward.available}</div>
                <div className="text-xs text-muted-foreground">Available</div>
                <div className="text-xs font-medium mt-1">{ward.ward}</div>
                <Progress value={pct} className="h-1 mt-2" />
                <div className="text-xs text-muted-foreground mt-1">{ward.occupied}/{ward.total}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Inpatient list */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold">Active Inpatients</h3>
          {ipdPatients.map((p: any) => {
            const isICU = p.status === "ICU";
            const daysSince = Math.floor((Date.now() - new Date(p.admittedOn).getTime()) / (1000*60*60*24));
            return (
              <Card key={p.id} className={`${isICU ? "border-red-200" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      isICU ? "bg-red-100 text-red-700" : "bg-teal-50 text-teal-700"
                    }`}>
                      {p.name.split(" ").map((n: string) => n[0]).join("").slice(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{p.name}</span>
                        <span className="text-xs font-mono text-muted-foreground">{p.id}</span>
                        <Badge className={`text-xs ${isICU ? "bg-red-100 text-red-700" : "bg-teal-100 text-teal-700"}`}>
                          {p.status}
                        </Badge>
                        {p.riskLevel === "Critical" && (
                          <Badge className="text-xs bg-red-100 text-red-700">
                            <AlertTriangle className="h-2.5 w-2.5 mr-1" />Critical
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{p.age}y · {p.gender === "M" ? "Male" : "Female"}</span>
                        <span>{p.department}</span>
                        <span>Dr: {p.doctor.replace("Dr. ","")}</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" /> Day {daysSince}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{p.diagnosis}</div>
                    </div>
                    <div className="shrink-0">
                      <div className="text-xs text-muted-foreground">{p.insurance}</div>
                      <div className="flex gap-1.5 mt-2 flex-wrap justify-end">
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <FileText className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                          disabled={discharging === p.id}
                          onClick={() => discharge(p)}
                        >
                          <LogOut className="h-3 w-3 mr-1" />
                          {discharging === p.id ? "..." : "Discharge"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Right panels */}
        <div className="space-y-3">
          {/* Nursing tasks */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Nursing Round Tasks</CardTitle>
                <Badge className="text-xs bg-amber-50 text-amber-700">
                  {NURSING_CHECKS.filter((n) => !n.done).length} pending
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {NURSING_CHECKS.map((check, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    check.done ? "bg-green-100" : "bg-amber-100"
                  }`}>
                    {check.done
                      ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                      : <Clock className="h-3 w-3 text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{check.task}</div>
                    <div className="text-xs text-muted-foreground truncate">{check.patient}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{check.time}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Ward summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Ward Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {WARD_SUMMARY.map((w) => {
                const pct = Math.round((w.occupied / w.beds) * 100);
                return (
                  <div key={w.ward} className="flex items-center gap-2">
                    <div className="text-xs font-medium w-20 shrink-0">{w.ward}</div>
                    <div className="flex-1">
                      <Progress value={pct} className="h-1.5" />
                    </div>
                    <div className="text-xs text-muted-foreground w-12 text-right">{w.occupied}/{w.beds}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* AI Discharge Readiness */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">AI Discharge Readiness</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: "Ramesh Babu",  ready: true,  note: "Clinically stable, post-angio day 5" },
                { name: "Lakshmi Devi", ready: false, note: "Pain management ongoing" },
                { name: "Preethi Raj",  ready: false, note: "36 weeks — monitoring" },
              ].map((item, i) => (
                <div key={i} className={`rounded-xl p-2.5 text-xs flex items-center gap-2 ${
                  item.ready ? "bg-green-50 border border-green-100" : "bg-muted"
                }`}>
                  {item.ready
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    : <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  }
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-muted-foreground">{item.note}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* New Admission modal — pre-fills status to IPD */}
      <PatientModal
        open={admitModalOpen}
        onClose={() => {
          setAdmitModalOpen(false);
          qc.invalidateQueries({ queryKey: ["patients-ipd"] });
        }}
        existing={{ status: "IPD" }}
      />
    </div>
  );
}
