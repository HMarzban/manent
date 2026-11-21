// How the production client reaches the server's production routes.

export interface ProductionTransport {
  /** Rejects with ConnectError when the server cannot be reached. */
  post(path: string, body: unknown): Promise<{ status: number; body: unknown }>;
}
