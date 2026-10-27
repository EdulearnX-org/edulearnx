import { describe, expect, it } from "vitest";
import { parseReceipt } from "./enrollmentRequests.js";

describe("payment receipt validation", () => {
  it("accepts a correctly signed PDF", () => {
    const pdf = Buffer.from("%PDF-1.7\nreceipt");
    const receipt = parseReceipt(
      `data:application/pdf;base64,${pdf.toString("base64")}`,
    );

    expect(receipt.contentType).toBe("application/pdf");
    expect(receipt.extension).toBe("pdf");
    expect(receipt.data.equals(pdf)).toBe(true);
  });

  it("rejects unsupported types and mismatched file signatures", () => {
    expect(() => parseReceipt("data:text/plain;base64,aGVsbG8=")).toThrow(
      "JPEG, PNG, WebP, or PDF",
    );
    expect(() => parseReceipt("data:image/png;base64,aGVsbG8=")).toThrow(
      "does not match its file type",
    );
  });

  it("rejects empty and oversized files", () => {
    expect(() => parseReceipt("data:application/pdf;base64,")).toThrow(
      "Receipt file is empty",
    );
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const withPdfHeader = Buffer.from("%PDF-" + oversized.toString("binary"));
    expect(() =>
      parseReceipt(
        `data:application/pdf;base64,${withPdfHeader.toString("base64")}`,
      ),
    ).toThrow("smaller than 5 MB");
  });
});
