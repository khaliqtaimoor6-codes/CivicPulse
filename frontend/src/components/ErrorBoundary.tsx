import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
	children: ReactNode;
};

type ErrorBoundaryState = {
	hasError: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("CivicPulse render error", error, errorInfo);
	}

	resetBoundary = () => {
		this.setState({ hasError: false });
	};

	render() {
		if (this.state.hasError) {
			return (
				<main className="page" role="alert" aria-live="assertive">
					<div className="shell">
						<div className="empty">
							<h3>Something went wrong.</h3>
							<p>
								The page failed to render. Trying again usually clears it, and the reports you
								already filed are unaffected.
							</p>
							<button type="button" className="btn btn-primary" onClick={this.resetBoundary}>
								Try again
							</button>
						</div>
					</div>
				</main>
			);
		}

		return this.props.children;
	}
}
