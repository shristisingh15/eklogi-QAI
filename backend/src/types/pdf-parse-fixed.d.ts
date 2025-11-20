// backend/src/types/pdf-parse-fixed.d.ts
declare module "pdf-parse-fixed" {
  export interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  /**
   * Parse a PDF buffer and return a promise resolving to PDFParseResult.
   * Usage: const result = await pdfParse(buffer);
   */
  function pdfParse(data: Buffer | Uint8Array): Promise<PDFParseResult>;

  export default pdfParse;
}
