import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface State { err: string; }

export default class ModalErrorBoundary extends Component<{ children: ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { err: "" };
  }

  static getDerivedStateFromError(e: Error) {
    return { err: e?.message || String(e) };
  }

  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error("Modal crash:", e.message, "\n", info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3 shadow-2xl">
            <p className="text-base font-bold text-red-600">Render Error — check browser console</p>
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap border">
              {this.state.err}
            </pre>
            <button
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm"
              onClick={() => this.setState({ err: "" })}
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
