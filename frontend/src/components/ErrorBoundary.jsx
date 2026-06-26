import { Component } from "react";

/**
 * Wraps page routes so a crash in one page doesn't unmount the entire app.
 * Shows a recovery UI instead of a blank white screen.
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error("[ErrorBoundary] Caught render error:", error, info);
    }

    handleReset() {
        this.setState({ hasError: false, error: null });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#0f172a",
                    color: "#f1f5f9",
                    fontFamily: "system-ui, sans-serif",
                    padding: "2rem",
                    textAlign: "center",
                }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
                    <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Something went wrong
                    </h2>
                    <p style={{ color: "#94a3b8", marginBottom: "2rem", maxWidth: "400px" }}>
                        This page ran into an error. Your other data is safe.
                        {this.state.error && (
                            <span style={{ display: "block", marginTop: "0.5rem", fontSize: "0.8rem" }}>
                                {this.state.error.message}
                            </span>
                        )}
                    </p>
                    <div style={{ display: "flex", gap: "1rem" }}>
                        <button
                            onClick={() => this.handleReset()}
                            style={{
                                padding: "0.6rem 1.5rem",
                                background: "#6366f1",
                                color: "#fff",
                                border: "none",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontSize: "0.95rem",
                            }}
                        >
                            Try again
                        </button>
                        <button
                            onClick={() => window.location.href = "/dashboard"}
                            style={{
                                padding: "0.6rem 1.5rem",
                                background: "transparent",
                                color: "#94a3b8",
                                border: "1px solid #334155",
                                borderRadius: "8px",
                                cursor: "pointer",
                                fontSize: "0.95rem",
                            }}
                        >
                            Go to dashboard
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
