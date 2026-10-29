import { describe, expect, it } from "vitest";
import {
  attachmentError,
  MAX_ATTACHMENT_BYTES,
  submissionErrors,
  PROGRAMME,
  roundIsOpen,
  validOrganisationNumber,
} from "../../src/domain";
import { mockPdf, validFields } from "../fixtures/data";

describe("submission rules", () => {
  const attachment = { name: mockPdf.name, size: mockPdf.buffer.length };
  it("accepts valid mandatory information", () => {
    expect(submissionErrors(validFields, attachment)).toEqual({});
  });
  it.each(["", "production", "completed"] as const)(
    "blocks project stage %s even when other submission information is valid",
    (projectStage) => {
      const errors = submissionErrors(
        { ...validFields, projectStage },
        attachment,
      );
      expect(Object.keys(errors)).toEqual(["projectStage"]);
    },
  );
  it.each(["0", "-1", "1.5", "200001", "1e3", "   ", "Infinity"])(
    "rejects non-eligible amount %s",
    (amount) => {
      expect(
        submissionErrors({ ...validFields, amount }, attachment).amount,
      ).toBeDefined();
    },
  );
  it.each(["1", "200000"])("accepts amount boundary %s", (amount) => {
    expect(submissionErrors({ ...validFields, amount }, attachment)).toEqual(
      {},
    );
  });
  it.each(["123456789", "12345678", "1234567850", "12345678a", "000000001"])(
    "rejects organisation number %s with a wrong length, character or check digit",
    (organisationNumber) => {
      expect(
        submissionErrors({ ...validFields, organisationNumber }, attachment)
          .organisationNumber,
      ).toBeDefined();
    },
  );
  it.each(["123456785", "987654325"])(
    "accepts organisation number %s with a valid modulus 11 check digit",
    (organisationNumber) => {
      expect(validOrganisationNumber(organisationNumber)).toBe(true);
    },
  );
  it("rejects a number whose modulus 11 check digit would be 10", () => {
    // Weighted sum 12 leaves remainder 1, so no single check digit exists.
    for (let digit = 0; digit <= 9; digit++)
      expect(validOrganisationNumber(`40000000${digit}`)).toBe(false);
  });
  it("requires attachment, declaration and nonblank project text", () => {
    expect(
      submissionErrors(
        { ...validFields, title: " ", declaration: false },
        null,
      ),
    ).toMatchObject({
      title: expect.any(String),
      declaration: expect.any(String),
      attachment: expect.any(String),
    });
  });
});

describe("round deadline", () => {
  const cutoff = Date.parse(PROGRAMME.closesAt);
  it.each([
    [-1, true],
    [0, false],
    [1, false],
  ] as const)(
    "at cutoff offset %i ms, submissions are open: %s",
    (offset, open) => {
      expect(roundIsOpen(new Date(cutoff + offset))).toBe(open);
    },
  );
  it("is configured as 13:00 local time in Oslo, not 13:00 UTC", () => {
    // Guards the configuration: Oslo is UTC+1 or UTC+2 depending on the date.
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: PROGRAMME.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(PROGRAMME.closesAt));
    expect(local).toBe("13:00");
  });
});

describe("attachment rules", () => {
  it("accepts a PDF within the size limit", () => {
    expect(
      attachmentError(mockPdf.name, mockPdf.mimeType, mockPdf.buffer),
    ).toBeNull();
  });
  it("accepts the exact size boundary and rejects one byte over", () => {
    const bytes = Buffer.alloc(MAX_ATTACHMENT_BYTES);
    mockPdf.buffer.copy(bytes);
    expect(attachmentError("budget.pdf", "application/pdf", bytes)).toBeNull();
    expect(
      attachmentError(
        "budget.pdf",
        "application/pdf",
        Buffer.concat([bytes, Buffer.from("x")]),
      ),
    ).toContain("1 MiB");
  });
  it("rejects a misleading extension, media type or header", () => {
    expect(
      attachmentError("budget.exe", "application/pdf", mockPdf.buffer),
    ).toContain("PDF");
    expect(
      attachmentError("budget.pdf", "text/plain", mockPdf.buffer),
    ).toContain("PDF");
    expect(
      attachmentError("budget.pdf", "application/pdf", Buffer.from("not pdf")),
    ).toContain("header");
  });
});
