declare global {
  interface Window {
    pendo: {
      initialize: (config: {
        visitor: { id: string; [key: string]: unknown };
        account?: { id: string; [key: string]: unknown };
        [key: string]: unknown;
      }) => void;
      track: (eventName: string, metadata?: Record<string, unknown>) => void;
      identify: (config: {
        visitor: { id: string; [key: string]: unknown };
        account?: { id: string; [key: string]: unknown };
      }) => void;
    };
  }
}

export {};
