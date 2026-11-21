// What a production request answers: its value, or the HTTP status and body of its refusal.
import { PRODUCTION_REFUSALS } from "@manent/sync-protocol";
import type {
  ProductionRefusal,
  ProductionRefusalBody,
} from "@manent/sync-protocol";

export type ProductionOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; body: ProductionRefusalBody };

/** A refusal of any request. */
export type ProductionRefused = Extract<
  ProductionOutcome<never>,
  { ok: false }
>;

const STATUS: Readonly<Record<ProductionRefusal, number>> = Object.freeze({
  already_issued: 409,
  already_locked: 409,
  bad_request: 400,
  busy: 429,
  changed: 409,
  engine_unavailable: 422,
  forbidden: 403,
  not_found: 404,
  not_locked: 409,
  recall_closed: 409,
  unknown_label: 422,
});

/** `issued` is given for `already_issued` only. */
export function refused(
  error: ProductionRefusal,
  issued: ProductionRefusalBody["issued"] = null,
): ProductionRefused {
  return { ok: false, status: STATUS[error], body: { error, issued } };
}

export function isProductionRefusal(value: string): value is ProductionRefusal {
  return PRODUCTION_REFUSALS.some((refusal) => refusal === value);
}
