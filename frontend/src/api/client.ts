import type {
	Complaint,
	ComplaintCreateRequest,
	ComplaintFilters,
	ProviderMetaResponse,
	StatsResponse,
	Status,
} from "./types";

type ErrorBody = { detail?: string } | Record<string, unknown> | string | null;

export class ApiError extends Error {
	readonly status: number;
	readonly body: ErrorBody;

	constructor(message: string, status: number, body: ErrorBody) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

export class StatusTransitionError extends ApiError {
	constructor(message: string, body: ErrorBody) {
		super(message, 409, body);
		this.name = "StatusTransitionError";
	}
}

async function parseBody(response: Response): Promise<ErrorBody | unknown> {
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return response.json();
	}

	return response.text();
}

function errorMessage(body: ErrorBody): string {
	if (typeof body === "string") {
		return body;
	}
	if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
		return body.detail;
	}
	return "Request failed.";
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; response: Response }> {
	const response = await fetch(path, {
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
		...init,
	});
	const body = await parseBody(response);

	if (!response.ok) {
		const typedBody = body as ErrorBody;
		if (response.status === 409) {
			throw new StatusTransitionError(errorMessage(typedBody), typedBody);
		}
		throw new ApiError(errorMessage(typedBody), response.status, typedBody);
	}

	return { data: body as T, response };
}

export function createComplaint(data: ComplaintCreateRequest): Promise<Complaint> {
	return request<Complaint>("/api/complaints", {
		method: "POST",
		body: JSON.stringify(data),
	}).then(({ data: complaint }) => complaint);
}

export function getComplaint(id: string): Promise<Complaint> {
	return request<Complaint>(`/api/complaints/${encodeURIComponent(id)}`).then(({ data }) => data);
}

export function listComplaints(
	filters: ComplaintFilters = {},
	page = 1,
	pageSize = 20,
): Promise<{ items: Complaint[]; total: number }> {
	const params = new URLSearchParams({
		page: String(page),
		page_size: String(pageSize),
	});
	if (filters.category) params.set("category", filters.category);
	if (filters.priority) params.set("priority", filters.priority);
	if (filters.status) params.set("status", filters.status);

	return request<{ items: Complaint[]; total: number }>(`/api/complaints?${params.toString()}`).then(
		({ data }) => data,
	);
}

export function updateStatus(id: string, status: Status): Promise<Complaint> {
	return request<Complaint>(`/api/complaints/${encodeURIComponent(id)}/status`, {
		method: "PATCH",
		body: JSON.stringify({ status }),
	}).then(({ data }) => data);
}

export function getStats(): Promise<{ data: StatsResponse; cacheStatus: "HIT" | "MISS" }> {
	return request<StatsResponse>("/api/stats").then(({ data, response }) => ({
		data,
		cacheStatus: response.headers.get("X-Cache") === "HIT" ? "HIT" : "MISS",
	}));
}

export function getProviderMeta(): Promise<ProviderMetaResponse> {
	return request<ProviderMetaResponse>("/api/meta/providers").then(({ data }) => data);
}
