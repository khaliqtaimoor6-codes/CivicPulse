import { useEffect, useState, type CSSProperties } from "react";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";

import { getProviderMeta, getStats } from "../api/client";
import type { ProviderMetaResponse, StatsResponse, Status } from "../api/types";
import CountUp from "../components/CountUp";
import Marquee from "../components/Marquee";
import Reveal from "../components/Reveal";

const statusOrder: Status[] = ["open", "in_progress", "resolved", "rejected"];

type Loaded = {
	request: number;
	stats: StatsResponse | null;
	meta: ProviderMetaResponse | null;
	cacheStatus: "HIT" | "MISS" | null;
	error: string | null;
};

function labelFor(value: string): string {
	return value.replace("_", " ");
}

function sortedEntries(values: Record<string, number>): [string, number][] {
	return Object.entries(values).sort((a, b) => b[1] - a[1]);
}

function BarList({ values }: { values: Record<string, number> }) {
	const entries = sortedEntries(values);
	const max = Math.max(1, ...entries.map(([, count]) => count));

	return (
		<ul className="bars">
			{entries.map(([label, count], index) => (
				<li key={label}>
					<div className="bars__row">
						<span className="bars__name">{labelFor(label)}</span>
						<span className="bars__value">{count.toLocaleString("en-US")}</span>
					</div>
					<div className="bars__track">
						<div
							className="bars__fill"
							style={{ "--fill": count / max, "--bar-delay": `${index * 70}ms` } as CSSProperties}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}

function StatusRail({ values }: { values: Record<string, number> }) {
	const entries = statusOrder.map((status) => [status, values[status] ?? 0] as [string, number]);
	const total = Math.max(1, entries.reduce((sum, [, count]) => sum + count, 0));

	return (
		<>
			<div className="rail">
				{entries.map(([status, count], index) => (
					<span
						key={status}
						style={
							{
								"--fill": count / total,
								"--rail-delay": `${index * 80}ms`,
								background: `var(--st-${status === "in_progress" ? "progress" : status})`,
							} as CSSProperties
						}
					/>
				))}
			</div>
			<ul className="rail-legend">
				{entries.map(([status, count]) => (
					<li key={status} data-status={status}>
						<i aria-hidden="true" />
						{labelFor(status)}
						<b>{count.toLocaleString("en-US")}</b>
					</li>
				))}
			</ul>
		</>
	);
}

function LatencyTrace({ meta }: { meta: ProviderMetaResponse | null }) {
	const triages = meta?.recent_triages ?? [];
	const peak = Math.max(1, ...triages.map((triage) => triage.latency_ms));
	const fallbackCount = triages.filter((triage) => triage.was_fallback).length;

	return (
		<>
			<div className="trace">
				{triages.length === 0
					? Array.from({ length: 20 }, (_, index) => (
							<span className="trace__bar" key={index} style={{ height: "6%" }} />
						))
					: triages.map((triage, index) => (
							<span
								className="trace__bar"
								key={`${index}-${triage.latency_ms}`}
								data-fallback={triage.was_fallback}
								style={{ height: `${Math.max(4, (triage.latency_ms / peak) * 100)}%` }}
								title={`${triage.provider}: ${triage.latency_ms} ms`}
							/>
						))}
			</div>
			<div className="trace__axis">
				<span>
					Active provider <b>{meta?.active_provider ?? "unavailable"}</b>
				</span>
				<span>
					{fallbackCount} of {triages.length} on fallback
				</span>
			</div>
		</>
	);
}

export default function StatsPage() {
	const [request, setRequest] = useState(0);
	const [loaded, setLoaded] = useState<Loaded | null>(null);

	// Bumping the request id is what starts a refresh. Loading is derived from
	// it rather than toggled, so the button can never sit in a state where it
	// says it is refreshing but no request is in flight. The figures already
	// on screen stay there for the duration, so a refresh dims nothing and
	// blanks nothing.
	const isLoading = loaded?.request !== request;
	const isFirstLoad = loaded === null;
	const stats = loaded?.stats ?? null;
	const meta = loaded?.meta ?? null;
	const cacheStatus = loaded?.cacheStatus ?? null;
	const error = isLoading ? null : loaded?.error ?? null;

	useEffect(() => {
		let isCurrent = true;
		const currentRequest = request;

		Promise.allSettled([getStats(), getProviderMeta()]).then(([statsResult, metaResult]) => {
			if (!isCurrent) return;

			setLoaded({
				request: currentRequest,
				stats: statsResult.status === "fulfilled" ? statsResult.value.data : null,
				meta: metaResult.status === "fulfilled" ? metaResult.value : null,
				cacheStatus: statsResult.status === "fulfilled" ? statsResult.value.cacheStatus : null,
				error:
					statsResult.status === "rejected"
						? statsResult.reason instanceof Error
							? statsResult.reason.message
							: String(statsResult.reason)
						: null,
			});
		});

		return () => {
			isCurrent = false;
		};
	}, [request]);

	const topCategory = stats ? sortedEntries(stats.by_category)[0] : undefined;
	const resolvedShare = stats?.total
		? Math.round(((stats.by_status.resolved ?? 0) / stats.total) * 100)
		: 0;

	return (
		<main className="page">
			<div className="shell">
				<header className="page-head">
					<div>
						<h1 className="display page-head__title">City signals</h1>
						<p className="lede page-head__lede">
							Where complaints land, how urgent they are, and how fast the triage layer is
							answering.
						</p>
					</div>
					<div className="page-head__aside">
						{cacheStatus && (
							<span className="telemetry" data-value={cacheStatus}>
								Cache {cacheStatus}
							</span>
						)}
						<button
							type="button"
							className="btn btn-ghost"
							onClick={() => setRequest((current) => current + 1)}
							disabled={isLoading}
						>
							{isLoading ? "Refreshing..." : "Refresh stats"}
						</button>
					</div>
				</header>

				{error && (
					<div className="page-notice" role="alert">
						<WarningCircle size={18} weight="bold" />
						<p>{error}</p>
						<button
							type="button"
							className="btn btn-quiet"
							onClick={() => setRequest((current) => current + 1)}
						>
							Try again
						</button>
					</div>
				)}

				{isFirstLoad && (
					<div className="stat-board" aria-hidden="true">
						<div className="board-cell board-cell--wide">
							<div className="skeleton skeleton-line" data-w="40" />
							<div className="skeleton" style={{ height: "6rem", width: "55%" }} />
						</div>
						<div className="board-cell">
							<div className="skeleton skeleton-line" data-w="60" />
							<div className="skeleton" style={{ height: "8rem" }} />
						</div>
						<div className="board-cell">
							<div className="skeleton skeleton-line" data-w="60" />
							<div className="skeleton" style={{ height: "8rem" }} />
						</div>
					</div>
				)}

				{stats && (
					<>
						<Reveal className="signal-band">
							<div className="signal-band__head">
								<p>Most reported</p>
								<p className="metric">
									{topCategory && topCategory[1] > 0
										? `${labelFor(topCategory[0])}, ${topCategory[1]} reports`
										: "No reports in the system yet"}
								</p>
							</div>
							<Marquee label="Reports by category" duration={44}>
								{sortedEntries(stats.by_category).map(([label, count]) => (
									<span className="marquee__item" key={label}>
										<span>{labelFor(label)}</span>
										<b>{count.toLocaleString("en-US")}</b>
									</span>
								))}
							</Marquee>
						</Reveal>

						<div className="stat-board" data-refreshing={isLoading || undefined}>
							<section className="board-cell board-cell--wide">
								<div className="board-cell__head">
									<h2>Complaints on record</h2>
									<span>All time</span>
								</div>
								<p className="board-total">
									<CountUp value={stats.total} />
								</p>
								<p className="board-total-label">Reports filed through CivicPulse</p>

								<div className="board-figure">
									<p className="board-figure__value">{resolvedShare}%</p>
									<p className="board-figure__label">
										of everything filed has reached a resolved status. The rest are open
										or still being worked.
									</p>
								</div>
							</section>

							<Reveal as="section" className="board-cell" delay={80}>
								<div className="board-cell__head">
									<h2>By priority</h2>
									<span>Counts</span>
								</div>
								<BarList values={stats.by_priority} />
							</Reveal>

							<Reveal as="section" className="board-cell" delay={160}>
								<div className="board-cell__head">
									<h2>By status</h2>
									<span>Share</span>
								</div>
								<StatusRail values={stats.by_status} />
							</Reveal>

							<Reveal as="section" className="board-cell" delay={80}>
								<div className="board-cell__head">
									<h2>Triage latency</h2>
									<span>Last 20</span>
								</div>
								<LatencyTrace meta={meta} />
							</Reveal>

							<Reveal as="section" className="board-cell" delay={160}>
								<div className="board-cell__head">
									<h2>By category</h2>
									<span>Counts</span>
								</div>
								<BarList values={stats.by_category} />
							</Reveal>
						</div>
					</>
				)}
			</div>
		</main>
	);
}
