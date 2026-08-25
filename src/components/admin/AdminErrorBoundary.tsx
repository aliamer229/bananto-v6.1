import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface AdminErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface AdminErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class AdminErrorBoundary extends Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AdminErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Internal diagnostic log (developer console only)
    console.error(`[AdminErrorBoundary:${this.props.sectionName || "Section"}]`, {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const sectionTitle = this.props.sectionName || "هذا القسم";

      return (
        <div
          className="m-4 p-6 bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 rounded-3xl space-y-4 text-right animate-in fade-in duration-200"
          dir="rtl"
        >
          <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
            <div className="p-2.5 rounded-2xl bg-rose-500/10">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">
                حدث خطأ غير متوقع أثناء عرض {sectionTitle}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                تم عزل الخطأ لمنع توقف باقي لوحة الإدارة. يمكنك إعادة المحاولة بأمان.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-foreground text-background hover:opacity-90 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة تحميل القسم
            </button>
          </div>

          {process.env.NODE_ENV !== "production" && this.state.error && (
            <details className="mt-4 p-3 bg-muted/50 rounded-xl text-xs font-mono text-muted-foreground overflow-x-auto" dir="ltr">
              <summary className="cursor-pointer font-sans font-bold text-foreground mb-2">
                تفاصيل الخطأ التشخيصية (Debug)
              </summary>
              <p className="text-rose-600 font-bold mb-1">{this.state.error.toString()}</p>
              <pre className="text-[11px] whitespace-pre-wrap">{this.state.error.stack}</pre>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-muted-foreground mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
