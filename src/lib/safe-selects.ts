export const employeeSafeSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  title: true,
  reportingManagerId: true,
  approverOverrideId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const employeeOptionSelect = {
  id: true,
  name: true,
} as const;
