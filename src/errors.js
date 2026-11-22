export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function requireThat(condition, message, status = 400) {
  if (!condition) throw new GameError(message, status);
}
