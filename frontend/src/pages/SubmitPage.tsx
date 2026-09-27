import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr/SpinnerGap";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";

import { createComplaint } from "../api/client";
import type { Complaint, ComplaintCreateRequest } from "../api/types";
import cityStreet from "../assets/city-street.jpg";
import Reveal from "../components/Reveal";
import useActiveStep from "../hooks/useActiveStep";

type FormErrors = Partial<Record<keyof ComplaintCreateRequest, string>>;

const flow = [
	{
		title: "You describe it",
		body: "A sentence is enough. What is broken, and where it is, is all the intake needs to start.",
	},
	{
		title: "The triage reads it",
		body: "The report is summarised and sorted into a service area and a priority before anyone sees the queue.",
	},
	{
		title: "It finds the right team",
		body: "Categorisation decides who owns the fix, so a streetlight does not land in the water queue.",
	},
	{
		title: "You watch it close",
		body: "The report carries a status that only moves forward, and the whole trail stays readable.",
	},
];

const nodes = ["Report received", "Triaged", "Routed", "Tracked"];

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

	const activeStep = useActiveStep(flow.length);
	const photoStyle = { "--bento-photo": `url(${cityStreet})` } as CSSProperties;

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
			{/* Hero. Asymmetric split, the photograph on a framed plate that
			    opens out of a flat teal wash as the page scrolls. */}
			<section className="hero">
				<div className="hero__media" aria-hidden="true">
					<img className="hero__photo" src={cityStreet} alt="" />
				</div>

				<div className="hero__inner shell">
					<div className="hero__copy">
						<p className="eyebrow hero__eyebrow">A clearer line to city services</p>
						<h1 className="display hero__title">
							<span className="line">
								<span>Report it once.</span>
							</span>
							<span className="line">
								<span>
									Watch it <em>get fixed.</em>
								</span>
							</span>
						</h1>
						<p className="hero__lede">
							CivicPulse reads your report, routes it to the right city team, and keeps a
							public trail to resolution.
						</p>
						<div className="hero__actions">
							<a className="btn btn-primary" href="#report-form">
								Start a report
								<ArrowUpRight size={17} weight="bold" />
							</a>
							<Link className="btn btn-ghost" to="/dashboard">
								Track reports
							</Link>
						</div>
					</div>

					<div className="hero__frame">
						<div className="hero__frame-inner">
							<img src={cityStreet} alt="A city street at night lit by working streetlights" />
							<span className="hero__frame-wash" />
						</div>
						<p className="hero__frame-caption">
							<ShieldCheck size={15} weight="bold" />
							Reported, routed, tracked
							<strong>01</strong>
						</p>
					</div>
				</div>
			</section>

			{/* What happens after you send. A sticky console beside four
			    scroll markers; the console advances as each marker takes the
			    centre of the viewport. */}
			<section className="pipeline">
				<div className="shell pipeline__grid">
					<div>
						<h2 className="h-section">What happens after you send</h2>
						<div className="pipeline__steps">
							{flow.map((step, index) => (
								<div
									className="pipeline__marker"
									key={step.title}
									data-pipeline-marker=""
									data-active={index === activeStep}
								>
									<div className="pipeline__marker-body">
										<span className="pipeline__marker-index">
											{String(index + 1).padStart(2, "0")}
										</span>
										<h3>{step.title}</h3>
										<p>{step.body}</p>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="pipeline__sticky">
						<div className="pipeline__console">
							<div className="pipeline__console-head">
								<p>Intake</p>
								<p>{nodes[activeStep]}</p>
							</div>
							<div className="pipeline__flow">
								{nodes.map((node, index) => (
									<div
										className="pipeline__node"
										key={node}
										data-state={
											index < activeStep ? "done" : index === activeStep ? "active" : "idle"
										}
									>
										<span>{node}</span>
										<b>{String(index + 1).padStart(2, "0")}</b>
									</div>
								))}
							</div>
							<div className="pipeline__readout">
								<div>
									<span>Status trail</span>
									<strong>Open to resolved</strong>
								</div>
								<div>
									<span>Service areas</span>
									<strong>Six categories</strong>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* The report itself. The one surface that has to be right, so it
			    gets the most craft and the least decoration. */}
			<section className="report" id="report-form">
				<div className="shell report__grid">
					<div className="report__aside">
						<h2 className="h-section">What needs attention?</h2>
						<p>
							Your report is reviewed, categorised, and sent forward. Specific details help us
							act faster.
						</p>
						<ul className="report__checklist">
							<li>
								<MapPin size={15} weight="bold" />
								Name the nearest landmark or junction, not just the street.
							</li>
							<li>
								<CheckCircle size={15} weight="bold" />
								Leave contact details blank unless you want a reply.
							</li>
						</ul>
					</div>

					<div className="form-card">
						<div className="form-card__head">
							<h3>New report</h3>
							<span>Fields marked required</span>
						</div>

						{submitError && (
							<p className="notice notice--error" role="alert">
								<WarningCircle size={16} weight="bold" />
								{submitError}
							</p>
						)}
						{isSubmitting && (
							<p className="notice notice--busy" role="status" aria-live="polite">
								<SpinnerGap size={16} weight="bold" />
								Analyzing your report...
							</p>
						)}

						<form className="form-grid" onSubmit={handleSubmit} noValidate>
							<div className="field field--wide" data-invalid={Boolean(errors.text)}>
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
								<div className="field__foot">
									<span className="field__help" id="complaint-text-help">
										What is wrong, and what should be different.
									</span>
									<span className="field__count">{text.length} / 2000</span>
								</div>
								{errors.text && (
									<p className="field__error" id="complaint-text-error" role="alert">
										{errors.text}
									</p>
								)}
							</div>

							<div className="field" data-invalid={Boolean(errors.location)}>
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
								{errors.location && (
									<p className="field__error" id="complaint-location-error" role="alert">
										{errors.location}
									</p>
								)}
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

							<div className="field--wide form-actions">
								<button type="submit" className="btn btn-primary" disabled={isSubmitting} aria-busy={isSubmitting}>
									{isSubmitting ? "Analyzing..." : "Send report"}
									<ArrowUpRight size={17} weight="bold" />
								</button>
								<p className="form-actions__note">
									By submitting, you help build a more responsive city.
								</p>
							</div>
						</form>
					</div>
				</div>
			</section>

			{/* The payoff. What the triage came back with, laid out as a
			    receipt rather than a confirmation toast. */}
			{submittedComplaint && (
				<section className="receipt" aria-live="polite">
					<span className="receipt__glow" aria-hidden="true" />
					<div className="shell receipt__grid">
						<div>
							<h2 className="h-section">Here is what we found.</h2>
							<p className="lede" style={{ marginTop: "1.25rem" }}>
								Your report is in the queue. This is the routing the triage service applied
								before it reached an operations team.
							</p>
						</div>

						<div className="receipt__card">
							<div className="receipt__strip">
								<span>Triage result</span>
								<span>{submittedComplaint.triage_latency_ms} ms</span>
							</div>
							<div className="receipt__rows">
								<div className="receipt__cell" style={{ animationDelay: "60ms" }}>
									<span>Category</span>
									<strong>{submittedComplaint.category}</strong>
								</div>
								<div className="receipt__cell" style={{ animationDelay: "120ms" }}>
									<span>Priority</span>
									<strong>{submittedComplaint.priority}</strong>
								</div>
								<div className="receipt__cell receipt__cell--wide" style={{ animationDelay: "180ms" }}>
									<span>AI summary</span>
									<p className="receipt__summary">
										{submittedComplaint.ai_summary ?? "No summary returned."}
									</p>
								</div>
								<div className="receipt__cell" style={{ animationDelay: "240ms" }}>
									<span>Triaged by</span>
									<strong>{submittedComplaint.triaged_by}</strong>
								</div>
								<div className="receipt__cell" style={{ animationDelay: "300ms" }}>
									<span>Location</span>
									<strong>{submittedComplaint.location}</strong>
								</div>
							</div>
							<div className="receipt__foot">
								<p>Reference {submittedComplaint.id}</p>
								<Link className="btn btn-ghost" to="/dashboard">
									Track this report
									<ArrowUpRight size={16} weight="bold" />
								</Link>
							</div>
						</div>
					</div>
				</section>
			)}

			<section className="shell" style={{ paddingBlock: "clamp(4rem, 8vw, 7rem)" }}>
				<Reveal className="bento">
					<article className="bento__cell bento__cell--photo" style={photoStyle}>
						<h3 className="h-card">Six service areas, one queue</h3>
						<p>
							Water, power, waste, roads, street lighting, and everything else share a single
							intake. Nothing falls between two teams.
						</p>
					</article>
					<article className="bento__cell bento__cell--field">
						<h3 className="h-card">Contact stays optional</h3>
						<p>
							File a report without leaving a name or a number. Add contact details only if you
							want to hear what happened.
						</p>
					</article>
					<article className="bento__cell bento__cell--pattern">
						<h3 className="h-card">A trail anyone can read</h3>
						<p>
							Status moves forward and never back, so the same question always gets the same
							answer.
						</p>
					</article>
				</Reveal>
			</section>
		</main>
	);
}
