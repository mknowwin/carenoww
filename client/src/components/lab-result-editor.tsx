import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FlaskConical, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { todayInTz } from "@/lib/utils";
import { buildParameterTemplate } from "@/lib/labTestMaster";

export interface LabParam {
  testName: string;
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
}

interface LabResultEditorProps {
  order: {
    _id: string;
    test: string;
    parameters?: LabParam[];
    result?: string;
    sampleDate?: string;
    reportedBy?: string;
  };
  onSave: (payload: Record<string, any>) => Promise<void>;
  saving?: boolean;
  defaultReportedBy?: string;
}

export function LabResultEditor({ order, onSave, saving, defaultReportedBy }: LabResultEditorProps) {
  const { user } = useAuth();
  const todayStr = todayInTz(user?.timezone ?? "Asia/Kolkata");

  const initialParams = (): LabParam[] => {
    if (order.parameters && order.parameters.length > 0) return order.parameters;
    const tests = order.test.split(",").map((t) => t.trim());
    return buildParameterTemplate(tests).map((p) => ({ ...p, value: p.defaultValue })) as LabParam[];
  };

  const [params,        setParams]        = useState<LabParam[]>(initialParams);
  const [reportedBy,    setReportedBy]     = useState(order.reportedBy ?? defaultReportedBy ?? "");
  const [sampleDate,    setSampleDate]     = useState(
    order.sampleDate ? order.sampleDate.slice(0, 10) : todayStr
  );
  const [resultText,    setResultText]     = useState(order.result ?? "");
  const [useStructured, setUseStructured]  = useState(params.length > 0);

  const updateParam = (testName: string, paramName: string, value: string) => {
    setParams((prev) =>
      prev.map((p) => p.testName === testName && p.name === paramName ? { ...p, value } : p)
    );
  };

  // Group params by testName for display
  const byTest: Record<string, LabParam[]> = {};
  for (const p of params) {
    const key = p.testName || order.test;
    if (!byTest[key]) byTest[key] = [];
    byTest[key].push(p);
  }

  const canSave = useStructured
    ? params.some((p) => p.value.trim() !== "")
    : resultText.trim().length > 0;

  const handleSave = async () => {
    const payload: any = { status: "Completed", sampleDate, reportedBy };
    if (useStructured && params.length > 0) {
      payload.parameters = params;
      payload.result = params.map((p) => `${p.name}: ${p.value} ${p.unit}`).join(", ");
    } else {
      payload.result = resultText.trim();
    }
    await onSave(payload);
  };

  return (
    <div className="space-y-3">
      {/* Sample Date + Reported By */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Sample / Collection Date</Label>
          <Input
            type="date"
            className="mt-1 h-8 text-sm"
            value={sampleDate}
            max={todayStr}
            onChange={(e) => setSampleDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Reported By</Label>
          <Input
            className="mt-1 h-8 text-sm"
            placeholder="Technician / doctor name"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
          />
        </div>
      </div>

      {/* Toggle structured vs free-text */}
      {params.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseStructured(true)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              useStructured ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"
            }`}
          >
            Parameter Table
          </button>
          <button
            onClick={() => setUseStructured(false)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              !useStructured ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"
            }`}
          >
            Free Text
          </button>
        </div>
      )}

      {/* Structured parameter entry */}
      {useStructured && params.length > 0 ? (
        <div className="space-y-3">
          {Object.entries(byTest).map(([testName, testParams]) => (
            <div key={testName} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-teal-50 border-b border-teal-100 px-3 py-1.5 flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5 text-teal-600" />
                <span className="text-xs font-semibold text-teal-700">{testName}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-[38%]">Parameter</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-[22%]">Value *</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-[14%]">Unit</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600">Reference Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testParams.map((p) => (
                      <tr key={p.name} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-1.5 text-gray-700 font-medium">{p.name}</td>
                        <td className="px-2 py-1">
                          <Input
                            className="h-7 text-xs border-gray-300 focus:border-teal-400 w-full"
                            value={p.value}
                            placeholder="Enter value"
                            onChange={(e) => updateParam(testName, p.name, e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{p.unit}</td>
                        <td className="px-3 py-1.5 text-gray-400 italic">{p.referenceRange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Enter result:</p>
          <Textarea
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder="Type lab result here (e.g. WBC 12.4 × 10³/µL, Hb 11.2 g/dL…)"
            className="text-sm min-h-[72px] resize-none"
            rows={3}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-7 text-xs bg-green-600 hover:bg-green-700"
          disabled={saving || !canSave}
          onClick={handleSave}
        >
          {saving
            ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving…</>
            : "Save & Complete"}
        </Button>
      </div>
    </div>
  );
}
