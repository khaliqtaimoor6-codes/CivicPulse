import type {
	Complaint,
	ComplaintCreateRequest,
	ComplaintFilters,
	ProviderMetaResponse,
	StatsResponse,
	Status,
} from "./types";

type ValidationItem = { msg?: unknown };

type ErrorBody =
	| { detail?: string | ValidationItem[] }
	| Record<string, unknown>
	| string
	| null;

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

const GENERIC_FAILURE = "Request failed.";

/**
 * FastAPI reports validation failures as a list of per-field errors rather than
 * one string. Collapsing that list to a generic message says nothing at the one
 * moment the detail would help, so the field messages are joined instead.
 */
function joinValidationDetail(detail: ValidationItem[]): string {
	const messages = detail
		.map((item) => (item && typeof item.msg === "string" ? item.msg.trim() : ""))
		.filter((message) => message.length > 0);
	return messages.join("; ");
}

function errorMessage(body: ErrorBody): string {
	if (typeof body === "string") {
		// A bare status such as 503 from a proxy can arrive with an empty
		// body, and an empty message renders as a blank notice with no
		// explanation at all.
		return body.trim() || GENERIC_FAILURE;
	}
	if (body && typeof body === "object" && "detail" in body) {
		const detail = body.detail;
		if (typeof detail === "string") return detail.trim() || GENERIC_FAILURE;
		if (Array.isArray(detail)) return joinValidationDetail(detail) || GENERIC_FAILURE;
	}
	return GENERIC_FAILURE;
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; response: Response }> {
	const response = await fetch(path, {
		...init,
		// Spread after init so a caller's headers merge with the default
		// instead of replacing the object wholesale, which would drop the
		// content type on any request that passed its own.
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
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
