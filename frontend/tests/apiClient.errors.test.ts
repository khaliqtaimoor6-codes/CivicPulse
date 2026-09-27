import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	ApiError,
	StatusTransitionError,
	createComplaint,
	getComplaint,
	getStats,
	listComplaints,
	updateStatus,
} from "../src/api/client";

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function textResponse(body: string, status: number) {
	return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("api client error mapping", () => {
	/**
	 * A rejected transition is a normal outcome of the dashboard, not a crash.
	 * It gets its own error type so the row can show what the server said
	 * rather than a generic failure, and so it is never mistaken for a load
	 * failure that should replace the list.
	 */
	it("turns a 409 into a StatusTransitionError carrying the server's wording", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ detail: "Cannot transition from resolved to in_progress" }, 409),
		);

		const error = await updateStatus("c-1", "in_progress").catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(StatusTransitionError);
		expect((error as StatusTransitionError).status).toBe(409);
		expect((error as StatusTransitionError).message).toBe(
			"Cannot transition from resolved to in_progress",
		);
	});

	it("keeps a StatusTransitionError recognisable as an ApiError", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ detail: "nope" }, 409));

		const error = await updateStatus("c-1", "in_progress").catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as Error).name).toBe("StatusTransitionError");
	});

	it("preserves the status and body for other failures", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ detail: "Complaint not found" }, 404));

		const error = await getComplaint("missing").catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect(error).not.toBeInstanceOf(StatusTransitionError);
		expect((error as ApiError).status).toBe(404);
		expect((error as ApiError).body).toEqual({ detail: "Complaint not found" });
	});

	it("uses a plain-text error body verbatim", async () => {
		fetchMock.mockResolvedValue(textResponse("Bad Gateway", 502));

		const error = await getStats().catch((caught: unknown) => caught);

		expect((error as ApiError).message).toBe("Bad Gateway");
		expect((error as ApiError).status).toBe(502);
	});

	it("falls back to a generic message when the body carries no detail", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ something: "else" }, 500));

		const error = await getStats().catch((caught: unknown) => caught);

		expect((error as ApiError).message).toBe("Request failed.");
	});

	it("falls back when the body is empty", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

		const error = await getStats().catch((caught: unknown) => caught);

		expect((error as ApiError).message).toBe("Request failed.");
		expect((error as ApiError).status).toBe(503);
	});

	/**
	 * A validation body from FastAPI is a list of field errors, not a string.
	 * Collapsing that to "Request failed." tells the person nothing about what
	 * was wrong, which is the one moment the detail would help.
	 */
	it("joins field-level validation messages into something readable", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(
				{
					detail: [
						{ loc: ["body", "text"], msg: "String should have at least 10 characters" },
						{ loc: ["body", "location"], msg: "Field required" },
					],
				},
				422,
			),
		);

		const error = await createComplaint({ text: "short", location: "" }).catch(
			(caught: unknown) => caught,
		);

		expect((error as ApiError).status).toBe(422);
		expect((error as ApiError).message).toContain("String should have at least 10 characters");
		expect((error as ApiError).message).toContain("Field required");
	});

	it("leaves a network failure to propagate as a plain error", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

		const error = await listComplaints().catch((caught: unknown) => caught);

		// Not wrapped in ApiError: there is no status to report, and inventing
		// one would let the UI treat an offline device as a server problem.
		expect(error).toBeInstanceOf(TypeError);
		expect(error).not.toBeInstanceOf(ApiError);
	});

	it("does not resolve an error response as data", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ detail: "Complaint not found" }, 404));

		await expect(getComplaint("missing")).rejects.toBeInstanceOf(ApiError);
	});
});
