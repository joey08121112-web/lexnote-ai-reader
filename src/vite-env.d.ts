/// <reference types="vite/client" />

declare module 'mammoth/mammoth.browser' {
  export function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  export function convertToHtml(options: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
