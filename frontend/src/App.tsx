import { BrowserRouter, Route, Routes } from "react-router-dom";

import SiteFooter from "./components/SiteFooter";
import SiteHeader from "./components/SiteHeader";
import DashboardPage from "./pages/DashboardPage";
import StatsPage from "./pages/StatsPage";
import SubmitPage from "./pages/SubmitPage";
import "./App.css";

function App() {
	return (
		<BrowserRouter>
			<a className="skip-link" href="#main-content">
				Skip to content
			</a>
			<div className="grain" aria-hidden="true" />

			<SiteHeader />

			<div id="main-content" tabIndex={-1}>
				<Routes>
					<Route path="/" element={<SubmitPage />} />
					<Route path="/dashboard" element={<DashboardPage />} />
					<Route path="/stats" element={<StatsPage />} />
				</Routes>
			</div>

			<SiteFooter />
		</BrowserRouter>
	);
}

export default App;
