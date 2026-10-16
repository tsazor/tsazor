/** The rows the grid examples show: a small order list. */
export interface Order {
  id: number;
  customer: string;
  total: number;
  paid: boolean;
}

export const orders: Order[] = [
  { id: 1, customer: "Marta", total: 12.5, paid: true },
  { id: 2, customer: "Jonas", total: 30, paid: false },
  { id: 3, customer: "Lena", total: 7, paid: true },
  { id: 4, customer: "Ali", total: 18, paid: false },
  { id: 5, customer: "Nina", total: 9, paid: true },
  { id: 6, customer: "Pia", total: 22, paid: false },
];