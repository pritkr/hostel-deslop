import { isStaffRole, type UserRole } from "./auth-fields";
import type { SessionUser } from "./auth-functions";

/**
 * The complaint lifecycle — the single seam every status change goes through.
 *
 * Previously the FLOW table was copy-pasted in `complaint-actions.ts` and
 * `complaint-get.ts`, so adding a state meant editing two files and hoping
 * they stayed in sync. Deleting one copy concentrates the complexity here;
 * deleting this module would scatter it again, which is the deletion test
 * passing: this module is deep, its copies were shallow.
 */

export const FLOW = {
  submitted: ["acknowledged", "rejected"],
  acknowledged: ["in_progress", "rejected"],
  in_progress: ["resolved", "acknowledged"],
  resolved: ["closed", "reopened"],
  reopened: ["acknowledged", "in_progress", "resolved"],
  rejected: ["reopened"],
  closed: ["reopened"],
} as const satisfies Record<string, readonly string[]>;

export type ComplaintStatus = keyof typeof FLOW;

export function isComplaintStatus(value: string): value is ComplaintStatus {
  return Object.hasOwn(FLOW, value);
}

export function allowedTransitions(from: string): readonly string[] {
  return isComplaintStatus(from) ? FLOW[from] : [];
}

export function canTransition(from: string, to: string): boolean {
  return allowedTransitions(from).includes(to);
}

/**
 * The one status that advances a complaint, for the "next step" button on the
 * detail screen.
 *
 * The lifecycle in `FLOW` allows a status to branch (rejection, reopening), so
 * this is not derived from `allowedTransitions`: the button offers the
 * productive step only, and the server re-checks the transition regardless.
 */
const FORWARD_STEP = {
  submitted: "acknowledged",
  acknowledged: "in_progress",
  in_progress: "resolved",
} as const satisfies Partial<Record<ComplaintStatus, ComplaintStatus>>;

type ForwardableStatus = keyof typeof FORWARD_STEP;

function isForwardable(status: ComplaintStatus): status is ForwardableStatus {
  return status in FORWARD_STEP;
}

export type ForwardStep = (typeof FORWARD_STEP)[ForwardableStatus];

export function nextForwardStep(status: string): ForwardStep | null {
  if (!isComplaintStatus(status) || !isForwardable(status)) return null;

  return FORWARD_STEP[status];
}

/** Statuses that still represent outstanding work. */
export const OPEN_STATUSES = ["submitted", "acknowledged", "in_progress", "reopened"] as const;

type OpenStatus = (typeof OPEN_STATUSES)[number];

const OPEN_STATUS_SET: ReadonlySet<string> = new Set(OPEN_STATUSES);

export function isOpenStatus(status: string): status is OpenStatus {
  return OPEN_STATUS_SET.has(status);
}

/**
 * Priority is a closed set, like status. The database column is a plain text
 * column, so the value read back is a `string` until it is checked here — which
 * is why the policy module owns the check rather than each consumer.
 */
export const COMPLAINT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

const PRIORITY_SET: ReadonlySet<string> = new Set(COMPLAINT_PRIORITIES);

export function isComplaintPriority(value: string): value is ComplaintPriority {
  return PRIORITY_SET.has(value);
}

export type ConfidentialRef = {
  confidential: boolean | number | null;
  hostelId: string | null;
  studentId: string;
  assigneeId: string | null;
};

function isConfidential(c: ConfidentialRef): boolean {
  return c.confidential === true || c.confidential === 1;
}

/**
 * A confidential complaint is visible to the reporter, to campus-wide staff,
 * and to the warden of the building it belongs to. Everyone else must not
 * see it exists, which is why list queries apply this before shaping rows
 * for the client.
 *
 * This was copy-pasted in five modules with three different spellings
 * (one branch forgot the assignee, one forgot hostel scoping). There is now
 * exactly one spelling.
 */
export function canSeeConfidential(user: SessionUser, complaint: ConfidentialRef): boolean {
  if (!isConfidential(complaint)) return true;

  if (user.role === "admin") return true;

  if (user.role === "warden" && complaint.hostelId === user.hostelId) return true;

  if (complaint.studentId === user.id) return true;

  // Campus-wide staff see confidential work only when they hold the job —
  // otherwise any electrician could open any private report.
  if (user.role === "staff" && complaint.assigneeId === user.id) return true;

  return false;
}

/**
 * Issue photos are for the reporter and authorised staff — never other
 * residents. Non-confidential reports widen staff to everyone on shift;
 * confidential reports narrow to the same set that may open the complaint.
 */
export function canSeePhotos(user: SessionUser, complaint: ConfidentialRef): boolean {
  if (isConfidential(complaint)) return canSeeConfidential(user, complaint);

  if (complaint.studentId === user.id) return true;

  return isStaffRole(user.role);
}

export function isStaffish(role: UserRole): boolean {
  return isStaffRole(role);
}
