import { useState } from "react";
import type { FormEvent } from "react";

import { createComplaint } from "../api/client";
import type { Complaint, ComplaintCreateRequest } from "../api/types";

type FormErrors = Partial<Record<keyof ComplaintCreateRequest, string>>;

function validateForm(payload: ComplaintCreateRequest): FormErrors {
	const errors: FormErrors = {};

	if (payload.text.length < 10 || payload.text.length > 2000) {
		errors.text = "Complaint text must be between 10 and 2000 characters.";
	}

	if (payload.location.length < 3 || payload.location.length > 200) {
		errors.location = "Location must be between 3 and 200 characters.";
	}

	return errors;
}

export default function SubmitPage() {
	const [text, setText] = useState("");
	const [location, setLocation] = useState("");
	const [reporterContact, setReporterContact] = useState("");
	const [errors, setErrors] = useState<FormErrors>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submittedComplaint, setSubmittedComplaint] = useState<Complaint | null>(null);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const payload: ComplaintCreateRequest = {
			text,
			location,
			...(reporterContact ? { reporter_contact: reporterContact } : {}),
		};
		const nextErrors = validateForm(payload);
		setErrors(nextErrors);

		if (Object.keys(nextErrors).length > 0) {
			return;
		}

		setIsSubmitting(true);
		setSubmitError(null);
		try {
			const complaint = await createComplaint(payload);
			setSubmittedComplaint(complaint);
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : String(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	function updateText(value: string) {
		setText(value);
		setErrors((current) => ({ ...current, text: validateForm({ text: value, location }).text }));
	}

	function updateLocation(value: string) {
		setLocation(value);
		setErrors((current) => ({ ...current, location: validateForm({ text, location: value }).location }));
	}

	return (
		<main>
			<h1>Submit a complaint</h1>
			{submitError && <p role="alert">{submitError}</p>}
			{isSubmitting && <p role="status" aria-live="polite">Analyzing complaint...</p>}
			<form onSubmit={handleSubmit} noValidate>
				<div>
					<label htmlFor="complaint-text">Complaint</label>
					<textarea
						id="complaint-text"
						name="text"
						value={text}
						onChange={(event) => updateText(event.target.value)}
						required
						minLength={10}
						maxLength={2000}
						aria-invalid={Boolean(errors.text)}
						aria-describedby="complaint-text-help complaint-text-error"
					/>
					<div id="complaint-text-help">{text.length} / 2000 characters</div>
					{errors.text && <p id="complaint-text-error" role="alert">{errors.text}</p>}
				</div>

				<div>
					<label htmlFor="complaint-location">Location</label>
					<input
						id="complaint-location"
						name="location"
						type="text"
						value={location}
						onChange={(event) => updateLocation(event.target.value)}
						required
						minLength={3}
						maxLength={200}
						aria-invalid={Boolean(errors.location)}
						aria-describedby="complaint-location-error"
					/>
					{errors.location && <p id="complaint-location-error" role="alert">{errors.location}</p>}
				</div>

				<div>
					<label htmlFor="reporter-contact">Contact information (optional)</label>
					<input
						id="reporter-contact"
						name="reporter_contact"
						type="text"
						value={reporterContact}
						onChange={(event) => setReporterContact(event.target.value)}
					/>
				</div>

				<button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
					{isSubmitting ? "Analyzing..." : "Submit complaint"}
				</button>
			</form>

			{submittedComplaint && (
				<section aria-live="polite">
					<h2>Triage result</h2>
					<p><strong>Category:</strong> {submittedComplaint.category}</p>
					<p><strong>Priority:</strong> {submittedComplaint.priority}</p>
					<p><strong>AI summary:</strong> {submittedComplaint.ai_summary ?? "No summary returned."}</p>
					<p><strong>Triaged by:</strong> {submittedComplaint.triaged_by}</p>
				</section>
			)}
		</main>
	);
}
