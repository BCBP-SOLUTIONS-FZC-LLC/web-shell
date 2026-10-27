import type { DashboardFilters, DashboardView, TicketItem } from '../types/ticket';
export type DashboardLoadState = 'loading' | 'ready' | 'empty' | 'partial_failure';
type Options = {
    view: DashboardView;
    filters: DashboardFilters;
    canSeeAllTenders: boolean;
};
export declare function useDashboardData({ view, filters, canSeeAllTenders }: Options): {
    loadState: DashboardLoadState;
    tickets: TicketItem[];
    cachedAt: number | null;
    refreshing: boolean;
    refresh: () => void;
};
export {};
