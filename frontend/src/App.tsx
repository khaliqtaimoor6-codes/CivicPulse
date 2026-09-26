import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";

import DashboardPage from "./pages/DashboardPage";
import StatsPage from "./pages/StatsPage";
import SubmitPage from "./pages/SubmitPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="CivicPulse home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Civic<span>Pulse</span></span>
        </NavLink>
        <nav className="site-nav" aria-label="Main navigation">
          <NavLink to="/">Report an issue</NavLink>
          <NavLink to="/dashboard">Track reports</NavLink>
          <NavLink to="/stats">City signals</NavLink>
        </nav>
        <span className="service-status"><i /> Service online</span>
      </header>
      <Routes>
        <Route path="/" element={<SubmitPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
