import React, { Component, ErrorInfo, ReactNode } from "react";
import { Btn, Icon } from "./ui/primitives";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-paper flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-card border border-line-2 rounded-[var(--r-lg)] shadow-pop p-8 text-center">
                        <div className="w-12 h-12 rounded-[var(--r-lg)] border border-line bg-card-2 flex items-center justify-center mx-auto mb-5">
                            <Icon name="error" size={22} className="text-bad" />
                        </div>
                        <h1 className="font-serif text-xl text-ink mb-2">Something broke</h1>
                        <p className="text-sm text-ink-2 mb-5">
                            The app hit an unexpected error. Your notes are stored
                            locally and should be intact — reload to pick up where
                            you left off.
                        </p>
                        {this.state.error && (
                            <div className="bg-card-2 border border-line p-3 rounded-[var(--r)] text-left mb-5 overflow-auto max-h-32 text-xs font-mono text-bad">
                                {this.state.error.toString()}
                            </div>
                        )}
                        <Btn variant="primary" onClick={() => window.location.reload()} className="w-full">
                            Reload app
                        </Btn>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
