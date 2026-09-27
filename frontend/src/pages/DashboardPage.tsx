import { useEffect, useState, type CSSProperties } from "react";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Tray } from "@phosphor-icons/react/dist/ssr/Tray";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";

import { listComplaints, StatusTransitionError, updateStatus } from "../api/client";
import type { Category, Complaint, ComplaintFilters, Priority, Status } from "../api/types";
import Reveal from "../components/Reveal";

const PAGE_SIZE = 20;
const categories: Category[] = ["water", "electricity", "sanitation", "roads", "streetlights", "other"];
const priorities: Priority[] = ["high", "normal", "low"];
const statuses: Status[] = ["open", "in_progress", "resolved", "rejected"];

function labelFor(value: string): string {
	return value.replace("_", " ");
}

function formatDate(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SkeletonRows() {
	return (
		<div className="record-list" aria-hidden="true">
			{Array.from({ length: 5 }, (_, index) => (
				<div className="skeleton-row" key={index}>
					<div className="skeleton skeleton-line" data-w="40" />
					<div className="skeleton skeleton-line" data-w="85" />
					<div className="skeleton skeleton-line" data-w="60" />
				</div>
			))}
		</div>
	);
}

function EmptyState({ onReset }: { onReset: () => void }) {
	return (
		<div className="empty">
			<Tray size={30} weight="light" />
			<h3>No complaints match these filters</h3>
			<p>Widen the filters to see the rest of the queue, or clear them to start from the top of the list.</p>
			<button type="button" className="btn btn-ghost" onClick={onReset}>
				Clear filters
			</button>
		</div>
	);
}

type LoadedPage = {
	key: string;
	items: Complaint[];
	total: number;
	error: string | null;
};

function requestKeyFor(filters: ComplaintFilters, page: number): string {
	return [filters.category ?? "", filters.priority ?? "", filters.status ?? "", page].join("|");
}

export default function DashboardPage() {
	const [filters, setFilters] = useState<ComplaintFilters>({});
	const [page, setPage] = useState(1);
	const [loaded, setLoaded] = useState<LoadedPage | null>(null);
	const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
	const [pendingTransition, setPendingTransition] = useState<string | null>(null);

	// Loading and error are read off the last response rather than held in
	// their own state. A filter change moves the key straight away, so the list
	// is treated as loading until a response arrives for the key that is
	// actually on screen. The last good page stays on screen throughout, so
	// changing a filter never blanks the list the operator is reading.
	const requestKey = requestKeyFor(filters, page);
	const isLoading = loaded?.key !== requestKey;
	const error = isLoading ? null : loaded?.error ?? null;
	const hasResults = loaded !== null && loaded.error === null;
	const complaints = hasResults ? loaded.items : [];
	const total = hasResults ? loaded.total : 0;

	useEffect(() => {
		let isCurrent = true;
		const key = requestKeyFor(filters, page);

		listComplaints(filters, page, PAGE_SIZE)
			.then((response) => {
				if (!isCurrent) return;
				setLoaded({ key, items: response.items, total: response.total, error: null });
			})
			.catch((requestError: unknown) => {
				if (!isCurrent) return;
				setLoaded({
					key,
					items: [],
					total: 0,
					error: requestError instanceof Error ? requestError.message : String(requestError),
				});
			});

		return () => {
			isCurrent = false;
		};
	}, [filters, page]);

	function changeFilter<Key extends keyof ComplaintFilters>(key: Key, value: ComplaintFilters[Key]) {
		setFilters((current: ComplaintFilters) => ({ ...current, [key]: value || undefined }));
		setPage(1);
	}

	async function handleTransition(complaint: Complaint, nextStatus: Status) {
		setPendingTransition(`${complaint.id}:${nextStatus}`);
		setRowErrors((current) => ({ ...current, [complaint.id]: "" }));
		try {
			const updatedComplaint = await updateStatus(complaint.id, nextStatus);
			setLoaded((current) =>
				current && current.error === null
					? {
							...current,
							items: current.items.map((item) =>
								item.id === updatedComplaint.id ? updatedComplaint : item,
							),
						}
					: current,
			);
		} catch (requestError: unknown) {
			const message =
				requestError instanceof StatusTransitionError
					? requestError.message
					: requestError instanceof Error
						? requestError.message
						: String(requestError);
			setRowErrors((current) => ({ ...current, [complaint.id]: message }));
		} finally {
			setPendingTransition(null);
		}
	}

	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const hasFilters = Boolean(filters.category || filters.priority || filters.status);

	function filterGroup<Key extends keyof ComplaintFilters>(
		label: string,
		key: Key,
		options: readonly string[],
	) {
		const current = filters[key] as string | undefined;

		return (
			<div className="filter" key={key}>
				<span>{label}</span>
				<div className="filter__options" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
					<button
						type="button"
						className="chip"
						aria-pressed={!current}
						onClick={() => changeFilter(key, undefined)}
					>
						All
					</button>
					{options.map((option) => (
						<button
							type="button"
							className="chip"
							key={option}
							aria-pressed={current === option}
							onClick={() => changeFilter(key, (current === option ? undefined : option) as ComplaintFilters[Key])}
						>
							{labelFor(option)}
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<main className="page">
			<div className="shell">
				<header className="page-head">
					<div>
						<h1 className="display page-head__title">Complaint dashboard</h1>
						<p className="lede page-head__lede">
							Every report the city has taken in, with the status each one is sitting at right now.
						</p>
					</div>
					<div className="page-head__aside">
						<span className="page-head__count">In the system</span>
						<span className="page-head__figure metric">{total.toLocaleString("en-US")}</span>
					</div>
				</header>

				<section className="toolbar" aria-label="Complaint filters">
					{filterGroup("Category", "category", categories)}
					{filterGroup("Priority", "priority", priorities)}
					{filterGroup("Status", "status", statuses)}
					{hasFilters && (
						<button
							type="button"
							className="btn btn-quiet toolbar__reset"
							onClick={() => {
								setFilters({});
								setPage(1);
							}}
						>
							Clear filters
						</button>
					)}
				</section>

				{isLoading && <SkeletonRows />}

				{error && (
					<div className="page-notice" role="alert">
						<WarningCircle size={18} weight="bold" />
						<p>{error}</p>
					</div>
				)}

				{!isLoading && !error && complaints.length === 0 && (
					<EmptyState
						onReset={() => {
							setFilters({});
							setPage(1);
						}}
					/>
				)}

				{!isLoading && !error && complaints.length > 0 && (
					<Reveal as="div" className="record-list">
						{complaints.map((complaint, index) => (
							<article
								className="record"
								key={complaint.id}
								style={{ "--record-delay": `${Math.min(index, 8) * 45}ms` } as CSSProperties}
							>
								<div>
									<div className="record__meta">
										<span className="status-pill" data-status={complaint.status}>
											{labelFor(complaint.status)}
										</span>
										<span className="priority-flag" data-priority={complaint.priority}>
											{complaint.priority} priority
										</span>
										<span>{complaint.category}</span>
									</div>
									<p className="record__text">{complaint.text}</p>
									<p className="record__sub">
										<span>
											<MapPin size={13} weight="bold" />
											{complaint.location}
										</span>
										<span>
											<Clock size={13} weight="bold" />
											Logged {formatDate(complaint.created_at)}
										</span>
										<span>Triaged in {complaint.triage_latency_ms} ms</span>
									</p>
								</div>

								<div className="record__actions">
									<span className="record__actions-label">Move to</span>
									<div className="record__transitions">
										{statuses.map((nextStatus) => {
											const actionKey = `${complaint.id}:${nextStatus}`;
											const isCurrentStatus = complaint.status === nextStatus;
											return (
												<button
													key={nextStatus}
													type="button"
													className="chip"
													disabled={isCurrentStatus || pendingTransition !== null}
													onClick={() => handleTransition(complaint, nextStatus)}
												>
													{isCurrentStatus
														? labelFor(nextStatus)
														: pendingTransition === actionKey
															? "Updating..."
															: labelFor(nextStatus)}
												</button>
											);
										})}
									</div>
									{rowErrors[complaint.id] && (
										<p className="record__error" role="alert">
											{rowErrors[complaint.id]}
										</p>
									)}
								</div>
							</article>
						))}
					</Reveal>
				)}

				<nav className="pagination" aria-label="Complaint pages">
					<button
						type="button"
						className="btn btn-ghost"
						disabled={page === 1 || isLoading}
						onClick={() => setPage((current) => current - 1)}
					>
						Previous
					</button>
					<p>
						Page {page} of {pageCount}
					</p>
					<button
						type="button"
						className="btn btn-ghost"
						disabled={page >= pageCount || isLoading}
						onClick={() => setPage((current) => current + 1)}
					>
						Next
					</button>
				</nav>
			</div>
		</main>
	);
}
