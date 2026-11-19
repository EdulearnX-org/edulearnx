export const STUDENT_CLASS_TIME_SLOTS = [
  { value: "08:00", label: "8:00 AM - 8:40 AM" },
  { value: "14:00", label: "2:00 PM - 2:40 PM" },
  { value: "15:00", label: "3:00 PM - 3:40 PM" },
  { value: "16:00", label: "4:00 PM - 4:40 PM" },
  { value: "17:00", label: "5:00 PM - 5:40 PM" },
] as const;

export type StudentClassTimeSlot =
  (typeof STUDENT_CLASS_TIME_SLOTS)[number]["value"];

export const STUDENT_CLASS_TIME_SLOT_VALUES = STUDENT_CLASS_TIME_SLOTS.map(
  ({ value }) => value,
) as [StudentClassTimeSlot, ...StudentClassTimeSlot[]];

export function studentClassTimeSlotLabel(value: string | null | undefined) {
  return STUDENT_CLASS_TIME_SLOTS.find((slot) => slot.value === value)?.label;
}
