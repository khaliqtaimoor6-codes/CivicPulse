import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	createComplaint,
	getComplaint,
	getProviderMeta,
	getStats,
	listComplaints,
	updateStatus,
} from "../src/api/client";
import type { StatsResponse } from "../src/api/types";

const stats: StatsResponse = {
	total: 1,
	by_category: { water: 1, electricity: 0, sanitation: 0, roads: 0, streetlights: 0, other: 0 },
	by_priority: { high: 0, normal: 1, low: 0 },
	by_status: { open: 1, in_progress: 0, resolved: 0, rejected: 0 },
};

const providerMeta = { active_provider: "simulated", recent_triages: [] };

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});
}

function lastCall(): [string, RequestInit] {
	const call = fetchMock.mock.calls.at(-1);
	if (!call) throw new Error("fetch was never called");
	return [String(call[0]), (call[1] ?? {}) as RequestInit];
}

function lastUrl(): URL {
	return new URL(lastCall()[0], "http://frontend.test");
}

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("api client request building", () => {
	/**
	 * Every path is relative so the browser resolves it against the origin
	 * serving the app. An absolute URL here would break the Nginx proxy
	 * arrangement and put a baked-in host into the bundle.
	 */
	it("uses relative paths so the proxy arrangement keeps working", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));
		await listComplaints();

		expect(lastCall()[0]).toBe("/api/complaints?page=1&page_size=20");
	});

	it("always asks for JSON, including on GET", async () => {
		fetchMock.mockResolvedValue(jsonResponse(providerMeta));
		await getProviderMeta();

		const headers = lastCall()[1].headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	it("paginates and omits filters that were not set", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));
		await listComplaints({ status: "open" }, 3, 25);

		const url = lastUrl();
		expect(url.searchParams.get("page")).toBe("3");
		expect(url.searchParams.get("page_size")).toBe("25");
		expect(url.searchParams.get("status")).toBe("open");
		expect(url.searchParams.has("category")).toBe(false);
		expect(url.searchParams.has("priority")).toBe(false);
	});

	it("sends every filter that was set", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));
		await listComplaints({ category: "water", priority: "high", status: "rejected" });

		const url = lastUrl();
		expect(url.searchParams.get("category")).toBe("water");
		expect(url.searchParams.get("priority")).toBe("high");
		expect(url.searchParams.get("status")).toBe("rejected");
	});

	it("encodes an id into the path rather than concatenating it raw", async () => {
		fetchMock.mockResolvedValue(jsonResponse({}));
		await getComplaint("id with/slash?and=query");

		expect(lastCall()[0]).toBe("/api/complaints/id%20with%2Fslash%3Fand%3Dquery");
	});

	it("POSTs the complaint as JSON and returns the created record", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ id: "c-1" }, { status: 201 }));
		const result = await createComplaint({ text: "Burst main", location: "High Street" });

		const [path, init] = lastCall();
		expect(path).toBe("/api/complaints");
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({ text: "Burst main", location: "High Street" });
		expect(result).toEqual({ id: "c-1" });
	});

	it("omits the contact field entirely when none was given", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ id: "c-1" }, { status: 201 }));
		await createComplaint({ text: "Burst main", location: "High Street" });

		expect(JSON.parse(String(lastCall()[1].body))).not.toHaveProperty("reporter_contact");
	});

	it("PATCHes a status transition", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ id: "c-1", status: "resolved" }));
		await updateStatus("c-1", "resolved");

		const [path, init] = lastCall();
		expect(path).toBe("/api/complaints/c-1/status");
		expect(init.method).toBe("PATCH");
		expect(JSON.parse(String(init.body))).toEqual({ status: "resolved" });
	});

	it("reports a cache hit from the response header", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(stats, { headers: { "content-type": "application/json", "X-Cache": "HIT" } }),
		);
		await expect(getStats()).resolves.toEqual({ data: stats, cacheStatus: "HIT" });
	});

	it("reports a miss when the header says anything else", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(stats, { headers: { "content-type": "application/json", "X-Cache": "MISS" } }),
		);
		await expect(getStats()).resolves.toMatchObject({ cacheStatus: "MISS" });
	});

	it("reports a miss when the header is absent, rather than guessing a hit", async () => {
		fetchMock.mockResolvedValue(jsonResponse(stats));
		await expect(getStats()).resolves.toMatchObject({ cacheStatus: "MISS" });
	});
});
