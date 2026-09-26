import { readFile } from "node:fs/promises";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
const openApiUrl = `${backendUrl.replace(/\/$/, "")}/openapi.json`;

function schemaName(schema) {
	return schema?.$ref?.split("/").pop() ?? null;
}

function schemaFields(schema) {
	return new Set(Object.keys(schema?.properties ?? {}));
}

function interfaceFields(source, interfaceName) {
	const match = source.match(new RegExp(`interface\\s+${interfaceName}\\s*{([\\s\\S]*?)}`));
	if (!match) {
		throw new Error(`Interface ${interfaceName} was not found in src/api/types.ts`);
	}

	return new Set(
		[...match[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm)].map((field) => field[1]),
	);
}

function compareFields(label, openApiFields, typeFields, errors) {
	const missingFromTypes = [...openApiFields].filter((field) => !typeFields.has(field));
	const missingFromSchema = [...typeFields].filter((field) => !openApiFields.has(field));
	if (missingFromTypes.length > 0 || missingFromSchema.length > 0) {
		errors.push([
			`@@ ${label}`,
			...missingFromTypes.map((field) => `+ ${field} (OpenAPI only)`),
			...missingFromSchema.map((field) => `- ${field} (types.ts only)`),
		].join("\n"));
	}
}

const response = await fetch(openApiUrl);
if (!response.ok) {
	throw new Error(`Could not fetch ${openApiUrl}: HTTP ${response.status}`);
}

const openApi = await response.json();
const schemas = openApi.components?.schemas ?? {};
const typesSource = await readFile(new URL("../src/api/types.ts", import.meta.url), "utf8");
const errors = [];

const complaintSchemaName = schemas.ComplaintResponse ? "ComplaintResponse" : "Complaint";
const complaintSchema = schemas[complaintSchemaName];
if (!complaintSchema) {
	errors.push("@@ Complaint response\n+ OpenAPI complaint response schema was not found");
} else {
	compareFields("Complaint response", schemaFields(complaintSchema), interfaceFields(typesSource, "Complaint"), errors);
}

const complaintCreateSchema = schemas.ComplaintCreate;
if (!complaintCreateSchema) {
	errors.push("@@ POST /api/complaints request\n+ OpenAPI ComplaintCreate schema was not found");
} else {
	compareFields("POST /api/complaints request", schemaFields(complaintCreateSchema), interfaceFields(typesSource, "ComplaintCreateRequest"), errors);
}

const statusUpdateSchema = schemas.StatusUpdate;
if (!statusUpdateSchema) {
	errors.push("@@ PATCH /api/complaints/{id}/status request\n+ OpenAPI StatusUpdate schema was not found");
} else {
	const statusFields = schemaFields(statusUpdateSchema);
	if (!statusFields.has("status")) {
		errors.push("@@ PATCH /api/complaints/{id}/status request\n+ status (OpenAPI only)");
	}
}

const listSchemaName = schemaName(openApi.paths?.["/api/complaints"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema);
if (listSchemaName !== "ComplaintListResponse") {
	errors.push(`@@ GET /api/complaints response\n+ Expected ComplaintListResponse, found ${listSchemaName ?? "none"}`);
}

const getSchemaName = schemaName(openApi.paths?.["/api/complaints/{id}"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema);
if (getSchemaName !== complaintSchemaName) {
	errors.push(`@@ GET /api/complaints/{id} response\n+ Expected ${complaintSchemaName}, found ${getSchemaName ?? "none"}`);
}

if (errors.length > 0) {
	console.error("OpenAPI drift detected:\n" + errors.join("\n"));
	process.exitCode = 1;
} else {
	console.log(`OpenAPI complaint schemas match src/api/types.ts (${openApiUrl})`);
}
