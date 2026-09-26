import http from "k6/http";
import { check } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:8000").replace(/\/$/, "");

// The backend CPU request is 150m and the HPA targets 60% of it (90m/pod), so the
// original 50-VU profile no longer produces enough per-pod CPU to scale out.
// Default raised to 150 VUs; override with VUS=<n> for a lighter profile.
const vus = Number(__ENV.VUS || 150);
const hold = __ENV.HOLD || "4m";

export const options = {
	stages: [
		{ duration: "2m", target: vus },
		{ duration: hold, target: vus },
		{ duration: "1m", target: 0 },
	],
	thresholds: {
		http_req_failed: ["rate<0.05"],
		http_req_duration: ["p(95)<2000"],
	},
};

const complaints = [
	["A burst water pipe is flooding the sidewalk near the library", "water"],
	["An exposed electric wire is hanging beside the school entrance", "electricity"],
	["Garbage has been left along the market road for several days", "sanitation"],
	["A deep pothole is damaging vehicles outside the civic center", "roads"],
	["The streetlight near the bus stop has been out since last night", "streetlights"],
	["A damaged public notice board needs repair in the neighborhood", "other"],
];

function randomComplaint() {
	const [text, category] = complaints[Math.floor(Math.random() * complaints.length)];
	const suffix = `${Date.now()}-${__VU}-${__ITER}-${Math.floor(Math.random() * 100000)}`;

	return {
		text: `${text}. Test report ${suffix}; please route this ${category} issue.`,
		location: `Civic block ${Math.floor(Math.random() * 1000)}-${suffix}`,
	};
}

export default function () {
	const response = http.post(
		`${baseUrl}/api/complaints`,
		JSON.stringify(randomComplaint()),
		{
			headers: { "Content-Type": "application/json" },
			tags: { endpoint: "create-complaint" },
		},
	);

	if (response.status >= 500) {
		console.warn(`Complaint request returned ${response.status}: ${response.body}`);
	}

	check(response, {
		"complaint accepted or rate limited": (result) => result.status === 201 || result.status === 429,
	});
}// Placeholder.
