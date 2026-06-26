import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointments as apptApi, patients as patientsApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  User, Clock, CheckCircle2, Phone, Hash, ChevronRight,
  Stethoscope, AlertCircle, RefreshCw, Loader2, CalendarDays,
  Activity, FileText,
} from "lucide-react";

const GENDER_LABEL: Record<string, string> = { M: "Male", F: "Female", O: "Other" };

function WaitMinutes(checkedInAt: string | undefined): string {
  if (!checkedInAt) return "";
  const diff = Math.floor((Date.now() - new Date(checkedInAt).getTime()) / 60000);
  return `${diff}m waiting`;
}

function PatientDetailPanel({ patientId }: { patientId: string }) {
  const { data: patient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn:  () => patientsApi.get(patientId),
    enabled:  !!patientId,
    retry: false,
  });

  const { data: historyData } = useQuery({
    queryKey: ["appointments", { patientId: patient?.uhid }],
    queryFn:  () => apptApi.list({ patientId: patient!.uhid, limit: "5" }),
    enabled:  !!patient?.uhid,
    retry: false,
  });

  if (!patient) return (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading patient...
    </div>
  );

  const pastVisits = (historyData?.appointments ?? [])
    .filter((a: any) => a.status === "Completed")
    .slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Vitals row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Age",         value: patient.age ? `${patient.age}y` : "—" },
          { label: "Blood Group", value: patient.bloodGroup || "—" },
          { label: "Gender",      value: GENDER_LABEL[patient.gender] || patient.gender || "—" },
        ].map((v) => (
          <div key={v.label} className="bg-muted/40 rounded-lg p-2 text-center">
            <p className="text-xs text-muted-foreground">{v.label}</p>
            <p className="text-sm font-semibold mt-0.5">{v.value}</p>
          </div>
        ))}
      </div>

      {/* Contact + Risk */}
      <div className="space-y-1.5">
        {patient.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span>{patient.phone}</span>
          </div>
        )}
        {patient.insurance && patient.insurance !== "None" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>{patient.insurance}</span>
          </div>
        )}
        {patient.riskLevel && patient.riskLevel !== "Low" && (
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-red-500" />
            <Badge className={`text-xs ${
              patient.riskLevel === "Critical" ? "bg-red-100 text-red-700"
              : patient.riskLevel === "High"   ? "bg-orange-100 text-orange-700"
              :                                  "bg-amber-100 text-amber-700"
            }`}>
              {patient.riskLevel} Risk
            </Badge>
          </div>
        )}
      </div>

      {/* Diagnosis */}
      {patient.diagnosis && (
        <div className="bg-blue-50 rounded-lg px-3 py-2">
          <p className="text-xs font-medium text-blue-700">Last Diagnosis</p>
          <p className="text-sm text-blue-800 mt-0.5">{patient.diagnosis}</p>
        </div>
      )}

      {/* Past visits */}
      {pastVisits.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Recent Visits</p>
          <div className="space-y-1">
            {pastVisits.map((v: any) => (
              <div key={v._id || v.id} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
                <span>{v.date}</span>
                <span>{v.doctor}</span>
                <span>{v.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorQueuePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  // Use logged-in doctor's name; don't pass date so all active appointments show
  const doctorName = user?.role === "doctor" ? user.name : "";

  const { data: queueData, isLoading, refetch } = useQuery({
    queryKey: ["queue", { doctor: doctorName }],
    queryFn:  () => apptApi.queue(doctorName ? { doctor: doctorName } : {}),
    refetchInterval: 10000,
    retry: false,
  });

  const queue: any[] = queueData ?? [];

  const inConsult  = queue.find((a) => a.status === "In Consult");
  const waitingList = queue
    .filter((a) => a.status === "Waiting")
    .sort((a, b) => (a.tokenNumber ?? 0) - (b.tokenNumber ?? 0));
  const confirmedList = queue
    .filter((a) => a.status === "Confirmed")
    .sort((a, b) => (a.tokenNumber ?? 0) - (b.tokenNumber ?? 0));

  const handleCall = async (apt: any) => {
    setActionId(apt._id);
    try {
      await apptApi.call(apt._id);
      qc.invalidateQueries({ queryKey: ["queue"] });
      setSelectedPatient(apt);
    } catch (e: any) {
      alert(e.message || "Failed to call patient");
    } finally {
      setActionId(null);
    }
  };

  const handleComplete = async (apt: any) => {
    setActionId(apt._id + "complete");
    try {
      await apptApi.update(apt._id, { status: "Completed" });
      qc.invalidateQueries({ queryKey: ["queue"] });
      setSelectedPatient(null);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Doctor Queue</h2>
          <p className="text-sm text-muted-foreground">
            {user?.name ?? "Doctor"} · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-xs text-muted-foreground">
            <p>{waitingList.length} waiting · {confirmedList.length} confirmed</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: Queue panels */}
        <div className="lg:col-span-2 space-y-4">

          {/* Now In Room */}
          <Card className="border-blue-200 bg-blue-50/40">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Now In Room
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {!isLoading && !inConsult && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No patient in room. Call the next patient from the waiting list.
                </div>
              )}
              {inConsult && (
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-100 border border-blue-200 flex flex-col items-center justify-center shrink-0">
                    <Hash className="h-3.5 w-3.5 text-blue-500 mb-0.5" />
                    <span className="text-sm font-bold text-blue-700 font-mono">{inConsult.token}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base">{inConsult.patientName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge className="text-xs bg-gray-100 text-gray-600 font-mono">{inConsult.patientId}</Badge>
                      <Badge className="text-xs bg-blue-100 text-blue-700">{inConsult.type}</Badge>
                      {inConsult.patientAge && (
                        <span className="text-xs text-muted-foreground">{inConsult.patientAge}y {inConsult.patientGender}</span>
                      )}
                    </div>
                    {inConsult.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{inConsult.notes}</p>
                    )}
                    {inConsult.calledAt && (
                      <p className="text-xs text-blue-500 mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Called {Math.round((Date.now() - new Date(inConsult.calledAt).getTime()) / 60000)}m ago
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-teal-600 hover:bg-teal-700"
                      disabled={actionId === inConsult._id + "complete"}
                      onClick={() => handleComplete(inConsult)}
                    >
                      {actionId === inConsult._id + "complete" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setSelectedPatient(inConsult)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Waiting Queue */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Waiting Queue
                {waitingList.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 text-xs">{waitingList.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {waitingList.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No patients waiting.</p>
              )}
              {waitingList.map((apt, idx) => (
                <div
                  key={apt._id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedPatient?._id === apt._id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-amber-300 hover:bg-amber-50/30"
                  }`}
                  onClick={() => setSelectedPatient(apt)}
                >
                  {/* Position */}
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-amber-700">{idx + 1}</span>
                  </div>

                  {/* Token */}
                  <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center shrink-0">
                    <Hash className="h-3 w-3 text-amber-500" />
                    <span className="text-xs font-bold text-amber-700 font-mono leading-tight">{apt.token}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{apt.patientName}</p>
                      <Badge className="text-xs bg-gray-100 text-gray-500 font-mono">{apt.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {apt.patientAge ? `${apt.patientAge}y ` : ""}
                      {WaitMinutes(apt.checkedInAt)}
                    </p>
                  </div>

                  {/* Call button */}
                  <Button
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!!inConsult || actionId === apt._id}
                    onClick={(e) => { e.stopPropagation(); handleCall(apt); }}
                  >
                    {actionId === apt._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <><ChevronRight className="h-3.5 w-3.5 mr-0.5" /> Call In</>
                    )}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Confirmed (not yet checked in) */}
          {confirmedList.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Confirmed / Not Arrived
                  <Badge className="bg-gray-100 text-gray-600 text-xs">{confirmedList.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {confirmedList.map((apt) => (
                  <div key={apt._id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/30">
                    <span className="font-mono text-xs text-muted-foreground w-12">{apt.token}</span>
                    <span className="text-sm flex-1">{apt.patientName}</span>
                    <span className="text-xs text-muted-foreground">{apt.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Patient detail panel */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                {selectedPatient ? "Patient Details" : "Select a Patient"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedPatient ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Click a patient in the queue to view their details here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Patient header */}
                  <div className="flex items-center gap-3 pb-3 border-b">
                    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-base">{selectedPatient.patientName?.[0] ?? "P"}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{selectedPatient.patientName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{selectedPatient.patientId}</p>
                    </div>
                    <Badge className={`ml-auto text-xs ${
                      selectedPatient.status === "In Consult" ? "bg-blue-100 text-blue-700"
                      : "bg-amber-100 text-amber-700"
                    }`}>
                      {selectedPatient.status === "In Consult" ? "In Room" : "Waiting"}
                    </Badge>
                  </div>

                  {/* Visit info */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/40 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Token</p>
                      <p className="text-sm font-bold font-mono text-teal-600">{selectedPatient.token}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Visit Type</p>
                      <p className="text-sm font-semibold">{selectedPatient.type}</p>
                    </div>
                  </div>

                  {selectedPatient.notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-yellow-700">Chief Complaint</p>
                      <p className="text-sm text-yellow-800 mt-0.5">{selectedPatient.notes}</p>
                    </div>
                  )}

                  {/* Patient DB details */}
                  <PatientDetailPanel patientId={selectedPatient.patientId} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
