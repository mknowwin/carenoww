import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  title?: string;
  description?: string;
}

interface State {
  error: Error | null;
  referenceId: string;
}

export default class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, referenceId: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, referenceId: Math.random().toString(36).slice(2, 10) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[AppErrorBoundary] ${this.state.referenceId}:`, error.message, "\n", info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-lg space-y-4 rounded-lg border bg-background p-6 shadow-lg">
            <div className="space-y-1.5">
              <p className="text-lg font-semibold text-destructive">
                {this.props.title ?? "Something went wrong"}
              </p>
              <p className="text-sm text-muted-foreground">
                {this.props.description ?? "Please contact support if the problem persists."}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Reference ID: <span className="font-mono">{this.state.referenceId}</span>
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => this.setState({ error: null, referenceId: "" })}>
                Dismiss
              </Button>
              <Button variant="default" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
