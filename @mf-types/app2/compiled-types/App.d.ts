import './index.css';
export type DashboardAppProps = {
    userLabel?: string;
    onLogout?: () => void;
};
export default function App(props: DashboardAppProps): import("react").JSX.Element;
