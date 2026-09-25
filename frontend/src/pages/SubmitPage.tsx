import { useState } from "react";
import type { FormEvent } from "react";

import { createComplaint } from "../api/client";
import type { Complaint, ComplaintCreateRequest } from "../api/types";
import heroImage from "../assets/city-street.jpg";

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
		<main className="submit-page">
			<section className="hero-band">
				<div className="hero-copy">
					<p className="eyebrow">A clearer line to city services</p>
					<h1>Make your block<br /><em>heard.</em></h1>
					<p className="hero-intro">Tell us what needs attention. CivicPulse routes your report to the right civic team, with a clear status trail from first note to resolution.</p>
					<a className="text-link" href="#report-form">Start a report <span aria-hidden="true">↘</span></a>
				</div>
				<div className="hero-visual">
					<img src={heroImage} alt="Layered civic signal mark" />
					<div className="hero-coordinates">40.7128° N<br />74.0060° W</div>
					<div className="hero-caption"><span /> Live civic intake <strong>01</strong></div>
				</div>
			</section>

			<section className="report-section" id="report-form">
				<div className="section-intro">
					<p className="eyebrow">01 / New report</p>
					<h2>What needs attention?</h2>
					<p>Your report is reviewed, categorized, and sent forward. Specific details help us act faster.</p>
				</div>
				<div className="form-column">
					{submitError && <p className="message error-message" role="alert">{submitError}</p>}
					{isSubmitting && <p className="message loading-message" role="status" aria-live="polite"><span className="spinner" /> Analyzing your report...</p>}
					<form id="report-form" onSubmit={handleSubmit} noValidate>
						<div className="field field-wide">
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
					<div className="field-help" id="complaint-text-help">{text.length} / 2000 characters</div>
					{errors.text && <p id="complaint-text-error" role="alert">{errors.text}</p>}
				</div>

				<div className="field">
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

				<div className="field">
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
					{isSubmitting ? "Analyzing..." : "Send report"}<span aria-hidden="true">↗</span>
				</button>
			</form>
					<p className="form-note">By submitting, you help build a more responsive city.</p>
				</div>
			</section>

			{submittedComplaint && (
				<section className="result-section" aria-live="polite">
					<div><p className="eyebrow">02 / Report received</p><h2>Here is what we found.</h2></div>
					<div className="result-grid">
						<div><span>Category</span><strong>{submittedComplaint.category}</strong></div>
						<div><span>Priority</span><strong>{submittedComplaint.priority}</strong></div>
						<div className="result-summary"><span>AI summary</span><strong>{submittedComplaint.ai_summary ?? "No summary returned."}</strong></div>
						<div><span>Triaged by</span><strong>{submittedComplaint.triaged_by}</strong></div>
					</div>
				</section>
			)}
		</main>
	);
}
