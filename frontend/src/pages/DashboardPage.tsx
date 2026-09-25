import { useEffect, useState } from "react";

import { listComplaints, StatusTransitionError, updateStatus } from "../api/client";
import type { Category, Complaint, ComplaintFilters, Priority, Status } from "../api/types";

const PAGE_SIZE = 20;
const categories: Category[] = ["water", "electricity", "sanitation", "roads", "streetlights", "other"];
const priorities: Priority[] = ["high", "normal", "low"];
const statuses: Status[] = ["open", "in_progress", "resolved", "rejected"];
const transitions: Record<Status, Status[]> = {
	open: ["in_progress", "rejected"],
	in_progress: ["resolved", "rejected"],
	resolved: [],
	rejected: [],
};

function labelForStatus(status: Status): string {
	return status.replace("_", " ");
}

function labelForValue(value: string): string {
	return value.replace("_", " ");
}

export default function DashboardPage() {
	const [filters, setFilters] = useState<ComplaintFilters>({});
	const [page, setPage] = useState(1);
	const [complaints, setComplaints] = useState<Complaint[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
	const [pendingTransition, setPendingTransition] = useState<string | null>(null);

	useEffect(() => {
		let isCurrent = true;
		void Promise.resolve().then(() => {
			if (!isCurrent) return;
			setIsLoading(true);
			setError(null);
			return listComplaints(filters, page, PAGE_SIZE)
				.then((response) => {
					if (!isCurrent) return;
					setComplaints(response.items);
					setTotal(response.total);
				})
				.catch((requestError: unknown) => {
					if (isCurrent) {
						setError(requestError instanceof Error ? requestError.message : String(requestError));
					}
				})
				.finally(() => {
					if (isCurrent) setIsLoading(false);
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
			setComplaints((current) =>
				current.map((item) => (item.id === updatedComplaint.id ? updatedComplaint : item)),
			);
		} catch (requestError: unknown) {
			const message = requestError instanceof StatusTransitionError
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

	return (
		<main className="page-shell">
			<header className="page-heading">
				<div>
					<p className="eyebrow">Operations</p>
					<h1>Complaint dashboard</h1>
				</div>
				<p>{total} total complaints</p>
			</header>

			<section className="filter-bar" aria-label="Complaint filters">
				<label>
					Category
					<select value={filters.category ?? ""} onChange={(event) => changeFilter("category", event.target.value as Category || undefined)}>
						<option value="">All</option>
						{categories.map((category) => <option key={category} value={category}>{labelForValue(category)}</option>)}
					</select>
				</label>
				<label>
					Priority
					<select value={filters.priority ?? ""} onChange={(event) => changeFilter("priority", event.target.value as Priority || undefined)}>
						<option value="">All</option>
						{priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
					</select>
				</label>
				<label>
					Status
					<select value={filters.status ?? ""} onChange={(event) => changeFilter("status", event.target.value as Status || undefined)}>
						<option value="">All</option>
						{statuses.map((status) => <option key={status} value={status}>{labelForStatus(status)}</option>)}
					</select>
				</label>
			</section>

			{isLoading && <p role="status">Loading complaints...</p>}
			{error && <p className="error-message" role="alert">{error}</p>}
			{!isLoading && !error && complaints.length === 0 && <p>No complaints match these filters.</p>}

			<section className="complaint-list" aria-label="Complaints">
				{complaints.map((complaint) => (
					<article className="complaint-row" key={complaint.id}>
						<div className="complaint-content">
							<div className="complaint-meta">
								<span className={`status status-${complaint.status}`}>{labelForStatus(complaint.status)}</span>
								<span>{complaint.category}</span>
								<span>{complaint.priority} priority</span>
							</div>
							<h2>{complaint.text}</h2>
							<p>{complaint.location}</p>
						</div>
						<div className="complaint-actions">
							{transitions[complaint.status].map((nextStatus) => {
								const actionKey = `${complaint.id}:${nextStatus}`;
								return (
									<button
										key={nextStatus}
										type="button"
										disabled={pendingTransition !== null}
										onClick={() => handleTransition(complaint, nextStatus)}
									>
										{pendingTransition === actionKey ? "Updating..." : `Move to ${labelForStatus(nextStatus)}`}
									</button>
								);
							})}
							{rowErrors[complaint.id] && <p className="error-message" role="alert">{rowErrors[complaint.id]}</p>}
						</div>
					</article>
				))}
			</section>

			<nav className="pagination" aria-label="Complaint pages">
				<button type="button" disabled={page === 1 || isLoading} onClick={() => setPage((current) => current - 1)}>Previous</button>
				<span>Page {page} of {pageCount}</span>
				<button type="button" disabled={page >= pageCount || isLoading} onClick={() => setPage((current) => current + 1)}>Next</button>
			</nav>
		</main>
	);
}
