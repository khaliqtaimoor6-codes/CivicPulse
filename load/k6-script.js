import http from "k6/http";
import { check } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:8000").replace(/\/$/, "");

// The backend CPU request is 150m and the HPA targets 60% of it (90m/pod), so the
// original 50-VU profile no longer produces enough per-pod CPU to scale out.
// Default raised to 150 VUs; override with VUS=<n> for a lighter profile.
const vus = Number(__ENV.VUS || 150);

// Stage durations are overridable so the same script can produce both the full
// recorded evidence run and a short profile for a live demo. The defaults below
// are the evidence run: 2m ramp, 4m hold, 1m down = 7m. A demo run is
// RAMP=30s HOLD=90s DOWN=30s, which still gives metrics-server time to report
// several consecutive samples. Lowering these does not change what is measured,
// only how long the run takes.
const ramp = __ENV.RAMP || "2m";
const hold = __ENV.HOLD || "4m";
const down = __ENV.DOWN || "1m";

// Ingress routing is Host-header based, so pointing BASE_URL at the k3d
// loadbalancer's IP is only enough if the Host is set too. Prefer adding
// `127.0.0.1 civicpulse.local` to the hosts file and running
// BASE_URL=http://civicpulse.local; set HOST_HEADER when that is not possible
// (CI, a container without root) so the same run is still reproducible.
const hostHeader = __ENV.HOST_HEADER;

export const options = {
	stages: [
		{ duration: ramp, target: vus },
		{ duration: hold, target: vus },
		{ duration: down, target: 0 },
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
	const headers = { "Content-Type": "application/json" };
	if (hostHeader) {
		headers["Host"] = hostHeader;
	}

	const response = http.post(
		`${baseUrl}/api/complaints`,
		JSON.stringify(randomComplaint()),
		{
			headers: headers,
			tags: { endpoint: "create-complaint" },
		},
	);

	if (response.status >= 500) {
		console.warn(`Complaint request returned ${response.status}: ${response.body}`);
	}

	check(response, {
		"complaint accepted or rate limited": (result) => result.status === 201 || result.status === 429,
	});
}
