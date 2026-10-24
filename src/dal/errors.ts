import "server-only";

/** Errors the DAL throws on purpose; actions turn them into friendly messages. */

export class UnauthorizedError extends Error {
  constructor() {
    super("You're signed out. Sign in again and retry.");
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "That item no longer exists.") {
    super(message);
    this.name = "NotFoundError";
  }
}
