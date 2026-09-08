export type TaskCommentsCriteria =
  | "COMPULSORY"
  | "OPTIONAL"
  | "NOT_REQUIRED"
  | "LESS_THAN_8_HOURS"
  | "MORE_THAN_8_HOURS";

const LEAVE_TASK_NAMES = new Set([
  "casual leave",
  "sick leave",
  "privilege leave",
]);

export function isLeaveTaskName(taskName: string) {
  return LEAVE_TASK_NAMES.has(taskName.trim().toLowerCase());
}

export function commentsCriteriaForTask(
  taskName: string,
  projectCriteria: TaskCommentsCriteria
): TaskCommentsCriteria {
  return isLeaveTaskName(taskName) ? "NOT_REQUIRED" : projectCriteria;
}
