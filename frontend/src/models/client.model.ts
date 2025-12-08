export interface Client {
  id: number;
  type: 'PF' | 'PJ';
  name: string;
  email: string;
  document: string;
  phone?: string;
  balance: number;
  status: 'Ativo' | 'Inativo';
  recycledKg: number;
  address?: {
    street: string;
    number: string;
    complement?: string;
    district: string;
    city: string;
    state: string;
    zipCode: string;
  };
  create_date?: Date;
  birth_date?: Date;
}