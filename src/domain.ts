import { z } from "zod";

export const PROGRAMME = {
  id: "screen-development",
  name: "Screen development grant",
  description:
    "Development of a short film project, including research, writing and early planning.",
  maximumAmount: 200_000,
  closesAt: "2027-11-30T12:00:00.000Z",
  timeZone: "Europe/Oslo",
};

export type Round = {
  closesAt: string;
  timeZone: string;
  submissionOpen: boolean;
};
export type Programme = typeof PROGRAMME & { submissionOpen: boolean };

// The server checks an instant, not a browser clock or a rounded displayed minute.
export function roundIsOpen(now: Date): boolean {
  return now.getTime() < Date.parse(PROGRAMME.closesAt);
}

export const fieldsSchema = z
  .object({
    projectStage: z
      .enum(["", "development", "production", "completed"])
      .default(""),
    organisation: z.string().max(120),
    organisationNumber: z.string().max(30),
    contactName: z.string().max(120),
    email: z.string().max(200),
    title: z.string().max(160),
    summary: z.string().max(3000),
    amount: z.string().max(30),
    declaration: z.boolean(),
  })
  .strict();

export type Fields = z.infer<typeof fieldsSchema>;
export type Errors = Partial<Record<keyof Fields | "attachment", string>>;
export const emptyFields: Fields = {
  projectStage: "",
  organisation: "",
  organisationNumber: "",
  contactName: "",
  email: "",
  title: "",
  summary: "",
  amount: "",
  declaration: false,
};
export type Attachment = { name: string; size: number };
export type Application = {
  id: string;
  programmeId: string;
  round: Round;
  fields: Fields;
  status: "draft" | "submitted";
  revision: number;
  savedAt: string;
  attachment: Attachment | null;
  receipt: string | null;
  submittedAt: string | null;
};

// Norwegian organisation numbers end in a modulus 11 check digit (Brønnøysund rules).
export function validOrganisationNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce(
    (total, weight, index) => total + weight * Number(value[index]),
    0,
  );
  const check = (11 - (sum % 11)) % 11;
  return check !== 10 && check === Number(value[8]);
}

export function submissionErrors(
  fields: Fields,
  attachment: Attachment | null,
): Errors {
  const errors: Errors = {};
  if (!fields.projectStage)
    errors.projectStage = "Choose the project's current stage.";
  else if (fields.projectStage !== "development")
    errors.projectStage =
      "This programme supports development work only. Production and completed projects are not eligible.";
  if (!fields.organisation.trim())
    errors.organisation = "Enter an organisation name.";
  if (!validOrganisationNumber(fields.organisationNumber.trim()))
    errors.organisationNumber = "Enter a valid nine-digit organisation number.";
  if (!fields.contactName.trim()) errors.contactName = "Enter a contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()))
    errors.email = "Enter a valid email address.";
  if (!fields.title.trim()) errors.title = "Enter a project title.";
  if (!fields.summary.trim()) errors.summary = "Describe the project.";
  const amount = Number(fields.amount);
  if (
    !/^\d+$/.test(fields.amount) ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > PROGRAMME.maximumAmount
  ) {
    errors.amount = "Enter a whole amount from NOK 1 to NOK 200,000.";
  }
  if (!fields.declaration)
    errors.declaration = "Confirm that the information is accurate.";
  if (!attachment) errors.attachment = "Attach a project budget PDF.";
  return errors;
}

export const MAX_ATTACHMENT_BYTES = 1024 * 1024;
export function attachmentError(
  name: string,
  type: string,
  bytes: Uint8Array,
): string | null {
  if (
    !name ||
    name.length > 120 ||
    /[/\\\r\n]/.test(name) ||
    !name.toLowerCase().endsWith(".pdf") ||
    type !== "application/pdf"
  ) {
    return "Choose a PDF file (.pdf).";
  }
  if (bytes.length > MAX_ATTACHMENT_BYTES)
    return "The PDF must be no larger than 1 MiB.";
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    return "The file does not have a valid PDF header.";
  return null;
}
