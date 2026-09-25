import { useCallback, useEffect, useState } from "react";

import { getStats } from "../api/client";
import type { StatsResponse } from "../api/types";

function StatsGroup({ title, values }: { title: string; values: Record<string, number> }) {
	return (
		<section className="stats-group">
			<h2>{title}</h2>
			<ul>
				{Object.entries(values).map(([label, count]) => (
					<li key={label}><span>{label.replace("_", " ")}</span><strong>{count}</strong></li>
				))}
			</ul>
		</section>
	);
}

export default function StatsPage() {
	const [stats, setStats] = useState<StatsResponse | null>(null);
	const [cacheStatus, setCacheStatus] = useState<"HIT" | "MISS" | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadStats = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const response = await getStats();
			setStats(response.data);
			setCacheStatus(response.cacheStatus);
		} catch (requestError: unknown) {
			setError(requestError instanceof Error ? requestError.message : String(requestError));
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void Promise.resolve().then(() => loadStats());
	}, [loadStats]);

	return (
		<main className="page-shell">
			<header className="page-heading">
				<div>
					<p className="eyebrow">Signals</p>
					<h1>Complaint statistics</h1>
				</div>
				<button type="button" onClick={() => void loadStats()} disabled={isLoading}>
					{isLoading ? "Refreshing..." : "Refresh stats"}
				</button>
			</header>

			{cacheStatus && <p className={`cache-status cache-${cacheStatus.toLowerCase()}`}>Cache: {cacheStatus}</p>}
			{isLoading && <p role="status">Loading statistics...</p>}
			{error && <p className="error-message" role="alert">{error}</p>}
			{stats && (
				<>
					<p className="stats-total"><strong>{stats.total}</strong> total complaints</p>
					<div className="stats-grid">
						<StatsGroup title="By category" values={stats.by_category} />
						<StatsGroup title="By priority" values={stats.by_priority} />
						<StatsGroup title="By status" values={stats.by_status} />
					</div>
				</>
			)}
		</main>
	);
}
