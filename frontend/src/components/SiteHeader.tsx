import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { List } from "@phosphor-icons/react/dist/ssr/List";
import { Moon } from "@phosphor-icons/react/dist/ssr/Moon";
import { Sun } from "@phosphor-icons/react/dist/ssr/Sun";
import { X } from "@phosphor-icons/react/dist/ssr/X";

import BrandMark from "./BrandMark";
import useTheme from "../hooks/useTheme";

const links = [
	{ to: "/", label: "Report an issue" },
	{ to: "/dashboard", label: "Track reports" },
	{ to: "/stats", label: "City signals" },
];

export default function SiteHeader() {
	const [theme, toggleTheme] = useTheme();
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	useEffect(() => {
		if (!isMenuOpen) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setIsMenuOpen(false);
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isMenuOpen]);

	return (
		<>
			<header className="site-header">
				<NavLink className="brand" to="/" aria-label="CivicPulse home">
					<BrandMark />
					<span>CivicPulse</span>
				</NavLink>

				<nav className="site-nav" aria-label="Main navigation">
					{links.map((link) => (
						<NavLink key={link.to} to={link.to} end={link.to === "/"}>
							{link.label}
						</NavLink>
					))}
				</nav>

				<div className="header-tools">
					<span className="status-chip">
						<i aria-hidden="true" />
						Service online
					</span>
					<button
						type="button"
						className="icon-button theme-toggle"
						onClick={toggleTheme}
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
					>
						<Sun className="icon-sun" size={17} weight="bold" />
						<Moon className="icon-moon" size={17} weight="bold" />
					</button>
					<button
						type="button"
						className="icon-button menu-button"
						onClick={() => setIsMenuOpen(true)}
						aria-label="Open navigation"
						aria-expanded={isMenuOpen}
					>
						<List size={17} weight="bold" />
					</button>
				</div>
			</header>

			<div className="nav-overlay" data-open={isMenuOpen}>
				<button
					type="button"
					className="icon-button"
					style={{ position: "absolute", top: "1rem", right: "var(--gutter)" }}
					onClick={() => setIsMenuOpen(false)}
					aria-label="Close navigation"
				>
					<X size={17} weight="bold" />
				</button>
				<nav aria-label="Mobile navigation">
					{links.map((link) => (
						<NavLink key={link.to} to={link.to} end={link.to === "/"} onClick={() => setIsMenuOpen(false)}>
							{link.label}
						</NavLink>
					))}
				</nav>
			</div>
		</>
	);
}
