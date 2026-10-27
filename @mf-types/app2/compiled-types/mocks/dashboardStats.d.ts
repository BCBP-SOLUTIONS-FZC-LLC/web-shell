import type { DashboardView } from '../types/ticket';
export declare const KPI_COUNTS: Record<DashboardView, number>;
export declare function slaOverviewForMyTickets(): {
    total: number;
    onTrack: number;
    warning: number;
    breached: number;
};
