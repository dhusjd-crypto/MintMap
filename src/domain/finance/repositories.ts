import type {
  CreditCardStatement,
  FinancialAccount,
  FinancialInstitution,
  FinancialObligation,
  FinancialPayment,
  FinancialSchedule,
  FinancialTransaction,
  FinanceBook,
} from "./models";

export type Repository<T extends { id: string }> = {
  get(id: string): T | undefined;
  list(): T[];
  save(value: T): void;
  remove(id: string): void;
};
export type FinanceBookRepository = Repository<FinanceBook>;
export type FinancialInstitutionRepository = Repository<FinancialInstitution>;
export type FinancialAccountRepository = Repository<FinancialAccount>;
export type FinancialTransactionRepository = Repository<FinancialTransaction>;
export type FinancialObligationRepository = Repository<FinancialObligation>;
export type FinancialPaymentRepository = Repository<FinancialPayment>;
export type CreditCardStatementRepository = Repository<CreditCardStatement>;
export type FinancialScheduleRepository = Repository<FinancialSchedule>;

export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  private readonly values = new Map<string, T>();
  get(id: string): T | undefined {
    return this.values.get(id);
  }
  list(): T[] {
    return [...this.values.values()];
  }
  save(value: T): void {
    this.values.set(value.id, value);
  }
  remove(id: string): void {
    this.values.delete(id);
  }
}
