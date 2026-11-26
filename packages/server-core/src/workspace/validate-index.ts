// Access control and shape/size bounds for workspace index maps (such as `"templates"`).
import {
  TEMPLATE_MAX_BYTES,
  jsonMap,
  readWorkspaceTemplate,
  templateByteSize,
} from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type { Access } from "../sync/access.ts";
import { isWriterRole } from "../sync/admission.ts";

const reject = (path: string, message: string): Issue => ({
  path,
  code: "not_index",
  severity: "reject",
  message,
});

/**
 * Validates writes to a workspace index: `"templates"` requires a writer role (`owner` or `edit`),
 * and every stored template entry must satisfy its shape, block/row count (`<= 500`), own-id keying,
 * and UTF-8 byte-size (`<= 128 KiB`) bounds.
 */
export function validateWorkspaceIndexWrites(
  report: TransactionReport,
  doc: CrdtDoc | null,
  access: Access,
): Issue[] {
  if (!report.maps.includes("templates")) return [];
  if (!isWriterRole(access.role))
    return [
      reject(
        "maps.templates",
        `a push wrote the templates map, which a person of role ${access.role} may not write`,
      ),
    ];
  if (doc === null) return [];
  const issues: Issue[] = [];
  for (const [key, raw] of Object.entries(
    jsonMap(doc, "templates").entries(),
  )) {
    if (templateByteSize(raw) > TEMPLATE_MAX_BYTES) {
      issues.push(
        reject(
          `maps.templates.${key}`,
          `template "${key}" exceeds the ${TEMPLATE_MAX_BYTES} byte limit`,
        ),
      );
      continue;
    }
    const parsed = readWorkspaceTemplate(raw);
    if (parsed === null || parsed.id !== key)
      issues.push(
        reject(
          `maps.templates.${key}`,
          `template "${key}" does not match the template shape or limits`,
        ),
      );
  }
  return issues;
}
