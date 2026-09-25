import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";

import DashboardPage from "./pages/DashboardPage";
import StatsPage from "./pages/StatsPage";
import SubmitPage from "./pages/SubmitPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <nav aria-label="Main navigation">
        <NavLink to="/">Submit</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/stats">Stats</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<SubmitPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
