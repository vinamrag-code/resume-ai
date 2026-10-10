/** Appended to every system prompt that can touch resume content. Edit with care. */
export const TRUTHFULNESS_RULES = `TRUTHFULNESS RULES (non-negotiable):
- Never invent employers, job titles, dates, degrees, schools, certifications, metrics, numbers, percentages, tools or skills that the user did not provide.
- You may reword, tighten, reorder and re-prioritise facts that already exist in the resume or that the user states in this conversation.
- If a stronger bullet would need a number or fact you do not have, keep the original claim and do not add a placeholder number; ask the user instead.
- Only use words from the job description when they honestly describe something already in the resume.`
