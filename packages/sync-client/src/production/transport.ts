// How the production client reaches the server's production routes.

/** A body is the JSON the server answered, or its bytes for application/pdf. */
export interface ProductionTransport {
  /** Rejects with ConnectError when the server cannot be reached. */
  post(path: string, body: unknown): Promise<{ status: number; body: unknown }>;
  /** `path` carries its query. Rejects with ConnectError when the server cannot be reached. */
  get(path: string): Promise<{ status: number; body: unknown }>;
}
