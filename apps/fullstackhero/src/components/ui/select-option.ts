/** components/ui/select.tsx's and components/list/select.tsx's option. */
export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
};
