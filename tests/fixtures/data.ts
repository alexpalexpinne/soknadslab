import { emptyFields, type Fields } from "../../src/domain";

export const validFields: Fields = {
  ...emptyFields,
  projectStage: "development",
  organisation: "Fictional Screen Company",
  organisationNumber: "123456785",
  contactName: "Alex Example",
  email: "alex@example.test",
  title: "The last ferry",
  summary:
    "Development of a fictional short film about a coastal community: research, script development and an early production budget.",
  amount: "45000",
  declaration: true,
};
export const mockPdf = {
  name: "fictional-budget.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(
    "%PDF-1.4\n% Fictional test attachment; no private data\n%%EOF\n",
  ),
};
