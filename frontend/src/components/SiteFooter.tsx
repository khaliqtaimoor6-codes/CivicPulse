import { NavLink } from "react-router-dom";

import BrandMark from "./BrandMark";

const sections = [
	{
		heading: "Report",
		links: [
			{ to: "/", label: "Report an issue" },
			{ to: "/dashboard", label: "Track reports" },
		],
	},
	{
		heading: "City signals",
		links: [
			{ to: "/stats", label: "Complaint statistics" },
			{ to: "/dashboard", label: "Operations queue" },
		],
	},
];

export default function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="shell">
				<div className="footer-grid">
					<div>
						<NavLink className="brand" to="/" aria-label="CivicPulse home">
							<BrandMark size={22} />
							<span>CivicPulse</span>
						</NavLink>
						<p>
							A clearer line to city services. Reports are read, categorised, and routed to the
							team that can act on them.
						</p>
					</div>

					{sections.map((section) => (
						<div className="footer-col" key={section.heading}>
							<h2>{section.heading}</h2>
							<ul>
								{section.links.map((link) => (
									<li key={`${section.heading}-${link.label}`}>
										<NavLink to={link.to} end={link.to === "/"}>
											{link.label}
										</NavLink>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="footer-base">
					<span>CivicPulse</span>
					<NavLink to="/">Report an issue</NavLink>
					<NavLink to="/dashboard">Track reports</NavLink>
					<NavLink to="/stats">City signals</NavLink>
				</div>
			</div>
		</footer>
	);
}
