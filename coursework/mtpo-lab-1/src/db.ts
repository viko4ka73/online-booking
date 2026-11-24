
export const pool = {
  async query(..._args: unknown[]): Promise<{rows: any[]}> {
    throw new Error("A database test double is required; real PostgreSQL is disabled.");
  },
};
