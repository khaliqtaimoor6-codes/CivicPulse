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
				<main role="alert" aria-live="assertive">
					<h1>Something went wrong.</h1>
					<p>Try refreshing.</p>
					<button type="button" onClick={this.resetBoundary}>
						Try again
					</button>
				</main>
			);
		}

		return this.props.children;
	}
}
