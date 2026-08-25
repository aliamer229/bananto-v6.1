import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class SectionErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn(
      `[SECTION_ERROR_BOUNDARY] ${this.props.sectionName || "Section"} caught an error:`,
      error,
      errorInfo,
    );
  }

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      // Silently prevent this section from breaking the rest of the homepage
      return null;
    }

    return this.props.children;
  }
}
