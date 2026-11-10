// Each permission, as named in the sharing form, on a link or invitation row, and
// as an argument of create_caregiver_invitation.
export const permissionFields = [
  { key: "profile", column: "can_view_profile", argument: "view_profile", defaultOn: true },
  { key: "health", column: "can_view_health", argument: "view_health", defaultOn: false },
  { key: "contacts", column: "can_view_contacts", argument: "view_contacts", defaultOn: true },
  { key: "medications", column: "can_view_medications", argument: "view_medications", defaultOn: false },
  { key: "appointments", column: "can_view_appointments", argument: "view_appointments", defaultOn: false },
  { key: "sos", column: "can_receive_sos", argument: "receive_sos", defaultOn: true },
  { key: "manage", column: "can_manage_reminders", argument: "manage_reminders", defaultOn: false },
] as const;

export type PermissionKey = (typeof permissionFields)[number]["key"];
export type PermissionColumn = (typeof permissionFields)[number]["column"];
export type Permissions = Record<PermissionColumn, boolean>;

export type CareRecipient = Permissions & {
  link_id: string;
  patient_id: string;
  first_name: string;
  last_name: string;
};

/** Reads unticked boxes as false: anything not explicitly shared stays private. */
export function permissionsFromForm(formData: FormData) {
  return Object.fromEntries(permissionFields.map((field) => [field.key, formData.get(field.key) === "on"])) as Record<PermissionKey, boolean>;
}

export function canSeeMedicines(person: Permissions) {
  return person.can_view_medications || person.can_manage_reminders;
}

export function canSeeAppointments(person: Permissions) {
  return person.can_view_appointments || person.can_manage_reminders;
}
