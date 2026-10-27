export type DashboardView = 'my-tickets' | 'awaiting-review' | 'awaiting-approval' | 'delegated' | 'all-tenders';
export type SlaState = 'on_track' | 'warning' | 'breached';
export type TicketItem = {
    id: string;
    tenderTitle: string;
    client: string;
    stage: string;
    deliverable: string;
    section: string;
    department: string;
    roleLevel: string;
    dueDate: string;
    slaState: SlaState;
    restricted?: boolean;
    evidenceGrade?: string;
    delegatedFrom?: string;
    unreadComments: number;
    tenderDetailsUnavailable?: boolean;
    status: string;
};
export type DashboardFilters = {
    status: string;
    role: string;
    department: string;
    deadline: string;
    tender: string;
};
