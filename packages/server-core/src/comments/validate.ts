// What a push to a comments document may write.
import type { PushValidator } from "../sync/validate.ts";

/** Refuses every push, so that a comments document is read and never written until its pushes are checked. */
export const validateCommentsPush: PushValidator = ({ room }) => [
  {
    path: "",
    code: "unknown_node",
    severity: "reject",
    message: `a push to the comments document ${room.docId} is not checked yet`,
  },
];
