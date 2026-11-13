import type {
  Account,
  AccountInput,
  AccountUpdateInput,
  Attachment,
  AuthResponse,
  AutomaticImportState,
  BalanceResponse,
  Bank,
  BankConnection,
  Budget,
  BudgetInput,
  BudgetStatus,
  BulkUpdateInput,
  CashflowResponse,
  Category,
  CategoryInput,
  CategoryStatsResponse,
  CategoryUpdateInput,
  CreatedNotificationSource,
  CreatedToken,
  CurrenciesResponse,
  Debt,
  DebtInput,
  DebtMovementInput,
  DebtUpdateInput,
  Goal,
  GoalInput,
  ImportProfile,
  ImportProfileInput,
  InboxConfirmInput,
  InboxCounts,
  InboxItem,
  Interval,
  Label,
  LabelInput,
  LoginInput,
  PlannedPayment,
  PlannedPaymentInput,
  RecordInput,
  RecordItem,
  RecordPage,
  RecordTemplate,
  RegisterInput,
  ServerConfig,
  Session,
  StatsSummary,
  TemplateInput,
  TimeseriesResponse,
  TwoFactorSetup,
  UpcomingOccurrence,
  UpdateProfileInput,
  User,
} from '@dostotinka/shared';
import { CATEGORY_TEMPLATE } from '@dostotinka/shared';
import {
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { language, t } from '@/i18n';
import { prepareUpload } from '@/lib/attachments';
import { browserTimeZone } from '@/lib/utils';
import { ApiError, api } from './client';

export const qk = {
  config: ['config'] as const,
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  categoryUsage: ['categories', 'usage'] as const,
  labels: ['labels'] as const,
  records: ['records'] as const,
  planned: ['planned'] as const,
  budgets: ['budgets'] as const,
  stats: ['stats'] as const,
  currencies: ['currencies'] as const,
  sessions: ['sessions'] as const,
};

/** Invalidates everything that depends on records/balances. */
export function invalidateFinancialData(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.records }),
    qc.invalidateQueries({ queryKey: qk.accounts }),
    qc.invalidateQueries({ queryKey: qk.stats }),
    qc.invalidateQueries({ queryKey: qk.budgets }),
    qc.invalidateQueries({ queryKey: qk.planned }),
    qc.invalidateQueries({ queryKey: qk.categoryUsage }),
    qc.invalidateQueries({ queryKey: ['goals'] }),
    qc.invalidateQueries({ queryKey: ['debts'] }),
  ]);
}

// ───────────────────────────── Auth ─────────────────────────────

export function useServerConfig() {
  return useQuery({
    queryKey: qk.config,
    queryFn: () => api<ServerConfig>('/config'),
    staleTime: 5 * 60_000,
  });
}

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** Returns the logged-in user (only use inside authenticated routes). */
export function useUser(): User {
  const { data } = useMe();
  if (!data) throw new Error('useUser() used outside of an authenticated route');
  return data;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<AuthResponse>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (res) => {
      qc.clear();
      qc.setQueryData(qk.me, res.user);
    },
  });
}

export function useDemoLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<AuthResponse>('/auth/demo', { method: 'POST', body: {} }),
    onSuccess: (res) => {
      qc.clear();
      qc.setQueryData(qk.me, res.user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { ...input, timezone: browserTimeZone() },
      }),
    onSuccess: (res) => {
      qc.clear();
      qc.setQueryData(qk.me, res.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(qk.me, null);
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api<{ user: User }>('/me', { method: 'PATCH', body: input }),
    onSuccess: (res, input) => {
      qc.setQueryData(qk.me, res.user);
      if (input.baseCurrency) {
        void qc.invalidateQueries({ queryKey: qk.currencies });
        void invalidateFinancialData(qc);
      }
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api<void>('/me/password', { method: 'POST', body: input }),
  });
}

export function useSessions() {
  return useQuery({ queryKey: qk.sessions, queryFn: () => api<Session[]>('/me/sessions') });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<CreatedToken>('/me/tokens', { method: 'POST', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api<void>('/me', { method: 'DELETE', body: { password } }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(qk.me, null);
    },
  });
}

// ───────────────────────────── Accounts ─────────────────────────────

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts, queryFn: () => api<Account[]>('/accounts') });
}

export function useSaveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AccountInput | AccountUpdateInput }) =>
      id
        ? api<Account>(`/accounts/${id}`, { method: 'PATCH', body: input })
        : api<Account>('/accounts', { method: 'POST', body: input }),
    onSuccess: () => {
      void invalidateFinancialData(qc);
      void qc.invalidateQueries({ queryKey: qk.currencies });
    },
  });
}

export function useDeleteAccountItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useAdjustBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      balance,
      createRecord,
    }: {
      id: string;
      balance: number;
      createRecord: boolean;
    }) =>
      api<Account>(`/accounts/${id}/adjust-balance`, {
        method: 'POST',
        body: { balance, createRecord },
      }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useReorderAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<void>('/accounts/reorder', { method: 'POST', body: { ids } }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.accounts });
      const prev = qc.getQueryData<Account[]>(qk.accounts);
      if (prev) {
        const order = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          qk.accounts,
          [...prev].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.accounts, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  });
}

// ───────────────────────────── Categories & labels ─────────────────────────────

/** English names of the default categories by system key (to translate untouched names). */
const TEMPLATE_NAMES = new Map(
  CATEGORY_TEMPLATE.flatMap((g) => [
    [g.key, g.name] as const,
    ...g.children.map((c) => [`${g.key}.${c.key}`, c.name] as const),
  ]),
);

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: async () => {
      const categories = await api<Category[]>('/categories');
      if (language === 'en') return categories;
      // Default categories that were never renamed are shown in the UI language.
      return categories.map((c) =>
        c.systemKey && TEMPLATE_NAMES.get(c.systemKey) === c.name ? { ...c, name: t(c.name) } : c,
      );
    },
    staleTime: 5 * 60_000,
  });
}

export function useCategoryUsage() {
  return useQuery({
    queryKey: qk.categoryUsage,
    queryFn: () => api<Record<string, number>>('/categories/usage'),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CategoryInput | CategoryUpdateInput }) =>
      id
        ? api<Category>(`/categories/${id}`, { method: 'PATCH', body: input })
        : api<Category>('/categories', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories }),
  });
}

export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<void>('/categories/reorder', { method: 'POST', body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories });
      void invalidateFinancialData(qc);
    },
  });
}

export function useLabels() {
  return useQuery({
    queryKey: qk.labels,
    queryFn: () => api<Label[]>('/labels'),
    staleTime: 5 * 60_000,
  });
}

export function useSaveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: LabelInput }) =>
      id
        ? api<Label>(`/labels/${id}`, { method: 'PATCH', body: input })
        : api<Label>('/labels', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.labels }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/labels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.labels });
      void qc.invalidateQueries({ queryKey: qk.records });
    },
  });
}

// ───────────────────────────── Records ─────────────────────────────

export interface RecordFilters {
  from?: string;
  to?: string;
  accountIds?: string[];
  categoryIds?: string[];
  exactCategories?: boolean;
  uncategorized?: boolean;
  labelIds?: string[];
  types?: string[];
  search?: string;
  debtId?: string;
}

export function useRecords(filters: RecordFilters, pageSize = 50) {
  return useInfiniteQuery({
    queryKey: [...qk.records, 'list', filters, pageSize],
    queryFn: ({ pageParam, signal }) =>
      api<RecordPage>('/records', {
        query: { ...filters, limit: pageSize, cursor: pageParam ?? undefined },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export interface RecordSummary {
  currency: string;
  income: number;
  expense: number;
  net: number;
  count: number;
  transferCount: number;
}

export function useRecordSummary(filters: RecordFilters) {
  return useQuery({
    queryKey: [...qk.records, 'summary', filters],
    queryFn: ({ signal }) =>
      api<RecordSummary>('/records/summary', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  });
}

export interface RecordSuggestion {
  type: 'expense' | 'income';
  accountId: string;
  categoryId: string | null;
  payee: string | null;
  lastAmount: number;
  count: number;
}

export function useRecordSuggestions() {
  return useQuery({
    queryKey: [...qk.records, 'suggestions'],
    queryFn: () => api<RecordSuggestion[]>('/records/suggestions'),
    staleTime: 5 * 60_000,
  });
}

export function usePayees() {
  return useQuery({
    queryKey: [...qk.records, 'payees'],
    queryFn: () => api<string[]>('/records/payees'),
    staleTime: 60_000,
  });
}

export function useSaveRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RecordInput }) =>
      id
        ? api<RecordItem[]>(`/records/${id}`, { method: 'PUT', body: input })
        : api<RecordItem[]>('/records', { method: 'POST', body: input }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/records/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useAttachments(recordId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', recordId],
    queryFn: () => api<Attachment[]>(`/records/${recordId}/attachments`),
    enabled: !!recordId,
  });
}

/** Uploads files one after another. Returns the uploaded attachments. */
export function useUploadAttachments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordId, files }: { recordId: string; files: File[] }) => {
      const done: Attachment[] = [];
      for (const file of files) {
        const upload = await prepareUpload(file);
        done.push(
          await api<Attachment>(`/records/${recordId}/attachments`, {
            method: 'POST',
            file: upload.blob,
            query: { name: upload.name },
          }),
        );
      }
      return done;
    },
    onSettled: (_data, _err, { recordId }) => {
      void qc.invalidateQueries({ queryKey: ['attachments', recordId] });
      void qc.invalidateQueries({ queryKey: qk.records });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachment: Attachment) =>
      api<void>(`/attachments/${attachment.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attachments'] });
      void qc.invalidateQueries({ queryKey: qk.records });
    },
  });
}

export function useBulkUpdateRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkUpdateInput) =>
      api<{ updated: number }>('/records/bulk-update', { method: 'POST', body: input }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useBulkDeleteRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ deleted: number }>('/records/bulk-delete', { method: 'POST', body: { ids } }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

// ───────────────────────────── Stats ─────────────────────────────

export interface StatsScope {
  from: string;
  to: string;
  accountIds?: string[];
  /** Optional comparison period (defaults to the same length right before `from`). */
  compareFrom?: string;
  compareTo?: string;
}

const scopeQuery = (s: StatsScope) => ({
  from: s.from,
  to: s.to,
  accountIds: s.accountIds,
  compareFrom: s.compareFrom,
  compareTo: s.compareTo,
  tz: browserTimeZone(),
});

export function useStatsSummary(scope: StatsScope, enabled = true) {
  return useQuery({
    queryKey: [...qk.stats, 'summary', scope],
    queryFn: ({ signal }) =>
      api<StatsSummary>('/stats/summary', { query: scopeQuery(scope), signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCategoryStats(
  scope: StatsScope,
  type: 'expense' | 'income',
  parentId?: string | null,
) {
  return useQuery({
    queryKey: [...qk.stats, 'categories', scope, type, parentId ?? null],
    queryFn: ({ signal }) =>
      api<CategoryStatsResponse>('/stats/categories', {
        query: { ...scopeQuery(scope), type, parentId: parentId ?? undefined },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useTimeseries(
  scope: StatsScope,
  interval: Interval,
  type: 'expense' | 'income',
  categoryId?: string | null,
) {
  return useQuery({
    queryKey: [...qk.stats, 'timeseries', scope, interval, type, categoryId ?? null],
    queryFn: ({ signal }) =>
      api<TimeseriesResponse>('/stats/timeseries', {
        query: { ...scopeQuery(scope), interval, type, categoryId: categoryId ?? undefined },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCashflow(scope: StatsScope, interval: Interval) {
  return useQuery({
    queryKey: [...qk.stats, 'cashflow', scope, interval],
    queryFn: ({ signal }) =>
      api<CashflowResponse>('/stats/cashflow', {
        query: { ...scopeQuery(scope), interval },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useBalanceTrend(scope: StatsScope, interval: Interval) {
  return useQuery({
    queryKey: [...qk.stats, 'balance', scope, interval],
    queryFn: ({ signal }) =>
      api<BalanceResponse>('/stats/balance', { query: { ...scopeQuery(scope), interval }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRecordBounds() {
  return useQuery({
    queryKey: [...qk.stats, 'bounds'],
    queryFn: () => api<{ first: string | null; last: string | null }>('/stats/bounds'),
    staleTime: 5 * 60_000,
  });
}

// ───────────────────────────── Planned payments ─────────────────────────────

export function usePlanned() {
  return useQuery({
    queryKey: [...qk.planned, 'list'],
    queryFn: () => api<PlannedPayment[]>('/planned-payments'),
  });
}

export function useUpcoming(days = 30) {
  return useQuery({
    queryKey: [...qk.planned, 'upcoming', days],
    queryFn: () =>
      api<UpcomingOccurrence[]>('/planned-payments/upcoming', {
        query: { days, tz: browserTimeZone() },
      }),
  });
}

export function useSavePlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PlannedPaymentInput }) =>
      id
        ? api<PlannedPayment>(`/planned-payments/${id}`, { method: 'PUT', body: input })
        : api<PlannedPayment>('/planned-payments', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.planned }),
  });
}

export function useDeletePlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/planned-payments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.planned }),
  });
}

export function usePayPlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      dueDate?: string;
      amount?: number;
      toAmount?: number;
      accountId?: string;
      occurredAt?: string;
      note?: string | null;
    }) =>
      api<{ records: RecordItem[]; plannedPayment: PlannedPayment }>(
        `/planned-payments/${id}/pay`,
        { method: 'POST', body },
      ),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useSkipPlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<PlannedPayment>(`/planned-payments/${id}/skip`, { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.planned }),
  });
}

// ───────────────────────────── Budgets ─────────────────────────────

export function useBudgets(offset = 0) {
  return useQuery({
    queryKey: [...qk.budgets, 'list', offset],
    queryFn: () => api<BudgetStatus[]>('/budgets', { query: { tz: browserTimeZone(), offset } }),
    placeholderData: keepPreviousData,
  });
}

export function useBudgetHistory(id: string | null, periods = 6) {
  return useQuery({
    queryKey: [...qk.budgets, 'history', id, periods],
    queryFn: () =>
      api<BudgetStatus[]>(`/budgets/${id}/history`, { query: { tz: browserTimeZone(), periods } }),
    enabled: !!id,
  });
}

export function useSaveBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: BudgetInput }) =>
      id
        ? api<Budget>(`/budgets/${id}`, { method: 'PUT', body: input })
        : api<Budget>('/budgets', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets }),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets }),
  });
}

// ───────────────────────────── Currencies ─────────────────────────────

export function useCurrencies() {
  return useQuery({
    queryKey: qk.currencies,
    queryFn: () => api<CurrenciesResponse>('/currencies'),
  });
}

export function useSetRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rates: { currency: string; rate: number }[]) =>
      api<CurrenciesResponse>('/currencies/rates', { method: 'PUT', body: { rates } }),
    onSuccess: (data) => {
      qc.setQueryData(qk.currencies, data);
      void qc.invalidateQueries({ queryKey: qk.stats });
      void qc.invalidateQueries({ queryKey: qk.budgets });
    },
  });
}

export function useAddCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currency: string) =>
      api<CurrenciesResponse>('/currencies/rates', { method: 'POST', body: { currency } }),
    onSuccess: (data) => qc.setQueryData(qk.currencies, data),
  });
}

export function useRemoveCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currency: string) =>
      api<CurrenciesResponse>(`/currencies/rates/${currency}`, { method: 'DELETE' }),
    onSuccess: (data) => qc.setQueryData(qk.currencies, data),
  });
}

export function useRefreshRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrideManual: boolean) =>
      api<CurrenciesResponse>('/currencies/refresh', { method: 'POST', body: { overrideManual } }),
    onSuccess: (data) => {
      qc.setQueryData(qk.currencies, data);
      void qc.invalidateQueries({ queryKey: qk.stats });
      void qc.invalidateQueries({ queryKey: qk.budgets });
    },
  });
}

// ───────────────────────────── Goals ─────────────────────────────

// ───── Debts ─────

export function useDebts() {
  return useQuery({ queryKey: ['debts'], queryFn: () => api<Debt[]>('/debts') });
}

export function useCreateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DebtInput) => api<Debt>('/debts', { method: 'POST', body: input }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useUpdateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtUpdateInput }) =>
      api<Debt>(`/debts/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['debts'] }),
  });
}

export function useDebtMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtMovementInput }) =>
      api<Debt>(`/debts/${id}/movements`, { method: 'POST', body: input }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

export function useDeleteDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/debts/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateFinancialData(qc),
  });
}

// ───── Two-factor login ─────

export function useTwoFactorSetup() {
  return useMutation({
    mutationFn: () => api<TwoFactorSetup>('/me/2fa/setup', { method: 'POST' }),
  });
}

export function useEnableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; password: string }) =>
      api<{ recoveryCodes: string[] }>('/me/2fa/enable', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useNewRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api<{ recoveryCodes: string[] }>('/me/2fa/recovery-codes', {
        method: 'POST',
        body: { password },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useDisconnectSso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/me/oidc', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useDisableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api<void>('/me/2fa/disable', { method: 'POST', body: { password } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api<RecordTemplate[]>('/templates'),
    staleTime: 60_000,
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TemplateInput }) =>
      id
        ? api<RecordTemplate>(`/templates/${id}`, { method: 'PUT', body: input })
        : api<RecordTemplate>('/templates', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useGoals() {
  return useQuery({ queryKey: ['goals'], queryFn: () => api<Goal[]>('/goals') });
}

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: GoalInput }) =>
      id
        ? api<Goal>(`/goals/${id}`, { method: 'PUT', body: input })
        : api<Goal>('/goals', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useContributeGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api<Goal>(`/goals/${id}/contribute`, { method: 'POST', body: { amount } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

// ───────────────────────────── Automatic import ─────────────────────────────

const autoKey = ['automatic-import'] as const;
const inboxKey = ['inbox'] as const;

export function useAutomaticImport(enabled = true) {
  return useQuery({
    queryKey: autoKey,
    queryFn: () => api<AutomaticImportState>('/automatic-import'),
    enabled,
  });
}

/** Mutations of the automatic-import settings (they all refresh the same state). */
function useAutoMutation<V, R = unknown>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: autoKey });
      void qc.invalidateQueries({ queryKey: inboxKey });
    },
  });
}

export function useSetAutoImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { notificationsEnabled?: boolean; bankEnabled?: boolean }) =>
      api('/automatic-import', { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: autoKey });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
export const useCreatePhone = () =>
  useAutoMutation((name: string) =>
    api<CreatedNotificationSource>('/automatic-import/sources', { method: 'POST', body: { name } }),
  );
export const useUpdatePhone = () =>
  useAutoMutation(
    ({ id, ...body }: { id: string; name?: string; enabled?: boolean; autoConfirm?: boolean }) =>
      api(`/automatic-import/sources/${id}`, { method: 'PATCH', body }),
  );
export const useDeletePhone = () =>
  useAutoMutation((id: string) => api(`/automatic-import/sources/${id}`, { method: 'DELETE' }));
export const useUpdateNotificationApp = () =>
  useAutoMutation(({ id, ...body }: { id: string; accountId?: string | null; enabled?: boolean }) =>
    api(`/automatic-import/apps/${id}`, { method: 'PATCH', body }),
  );
export const useDeleteNotificationApp = () =>
  useAutoMutation((id: string) => api(`/automatic-import/apps/${id}`, { method: 'DELETE' }));
export const useSaveBankCredentials = () =>
  useAutoMutation((body: { applicationId: string; privateKey: string }) =>
    api<{ environment: string; active: boolean; redirectUrl: string }>(
      '/automatic-import/bank/credentials',
      { method: 'PUT', body },
    ),
  );
export const useDeleteBankCredentials = () =>
  useAutoMutation((_: undefined) =>
    api('/automatic-import/bank/credentials', { method: 'DELETE' }),
  );

export function useBanks(country: string | null) {
  return useQuery({
    queryKey: ['banks', country],
    queryFn: () => api<Bank[]>('/automatic-import/bank/banks', { query: { country } }),
    enabled: !!country,
    staleTime: 60 * 60_000,
  });
}

export const useConnectBank = () =>
  useAutoMutation((body: { bankName: string; country: string; renewConnectionId?: string }) =>
    api<{ url: string; connectionId: string; redirectUrl: string }>(
      '/automatic-import/bank/connections',
      { method: 'POST', body },
    ),
  );
export const useFinishBank = () =>
  useAutoMutation(
    (body: { state: string; code?: string; error?: string; errorDescription?: string }) =>
      api<BankConnection>('/automatic-import/bank/callback', { method: 'POST', body }),
  );
export const useUpdateBankConnection = () =>
  useAutoMutation(({ id, ...body }: { id: string; enabled?: boolean; autoConfirm?: boolean }) =>
    api(`/automatic-import/bank/connections/${id}`, { method: 'PATCH', body }),
  );
export const useSyncBank = () =>
  useAutoMutation((id: string) =>
    api<{ imported: number; duplicates: number }>(`/automatic-import/bank/connections/${id}/sync`, {
      method: 'POST',
    }),
  );
export const useDeleteBankConnection = () =>
  useAutoMutation((id: string) =>
    api(`/automatic-import/bank/connections/${id}`, { method: 'DELETE' }),
  );
export const useUpdateBankAccount = () =>
  useAutoMutation(
    ({
      id,
      ...body
    }: {
      id: string;
      accountId?: string | null;
      enabled?: boolean;
      importFrom?: string;
    }) => api(`/automatic-import/bank/accounts/${id}`, { method: 'PATCH', body }),
  );

// ───────────────────────────── Inbox ─────────────────────────────

export function useInbox(status: 'pending' | 'done' | 'ignored') {
  return useQuery({
    queryKey: [...inboxKey, status],
    queryFn: () => api<InboxItem[]>('/inbox', { query: { status } }),
  });
}

/** Number of transactions waiting for review (polled so the badge stays current). */
export function useInboxCount(enabled = true) {
  return useQuery({
    queryKey: [...inboxKey, 'count'],
    queryFn: () => api<InboxCounts>('/inbox/count'),
    enabled,
    refetchInterval: 60_000,
  });
}

function useInboxMutation<V, R = unknown>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inboxKey });
      void invalidateFinancialData(qc);
    },
  });
}

export const useConfirmInbox = () =>
  useInboxMutation(({ id, ...body }: { id: string } & InboxConfirmInput) =>
    api<InboxItem>(`/inbox/${id}/confirm`, { method: 'POST', body }),
  );
export const useUpdateInbox = () =>
  useInboxMutation(
    ({
      id,
      ...body
    }: {
      id: string;
      accountId?: string | null;
      type?: 'expense' | 'income';
      categoryId?: string | null;
      payee?: string | null;
    }) => api<InboxItem>(`/inbox/${id}`, { method: 'PATCH', body }),
  );
export const useInboxAction = () =>
  useInboxMutation(
    ({
      id,
      action,
    }: {
      id: string;
      action: 'dismiss' | 'link' | 'unmatch' | 'transfer' | 'restore';
    }) => api(`/inbox/${id}/${action}`, { method: 'POST' }),
  );
export const useInboxBulk = () =>
  useInboxMutation((body: { ids: string[]; action: 'confirm' | 'dismiss' }) =>
    api<{ done: number; skipped: number }>('/inbox/bulk', { method: 'POST', body }),
  );

// ───────────────────────────── CSV import profiles ─────────────────────────────

const profilesKey = ['import-profiles'] as const;

export function useImportProfiles() {
  return useQuery({
    queryKey: profilesKey,
    queryFn: () => api<ImportProfile[]>('/import/profiles'),
  });
}

export function useSaveImportProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportProfileInput) =>
      api<ImportProfile>('/import/profiles', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: profilesKey }),
  });
}

export function useDeleteImportProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/import/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: profilesKey }),
  });
}
