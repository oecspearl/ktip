/**
 * mammoth ships browser types only for its main entry; the browser bundle we
 * import in src/lib/document-extract.ts has none. Only convertToHtml is used.
 */
declare module 'mammoth/mammoth.browser' {
  interface ConvertResult {
    value: string
    messages: { type: string; message: string }[]
  }
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ConvertResult>
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ConvertResult>
  }
  export default mammoth
}
