import type { ThemeMode } from '../theme/themeMode';
type BrandLogoProps = {
    className?: string;
    size?: number;
    /** Full wordmark for dashboard sidebar */
    variant?: 'mark' | 'main';
    theme?: ThemeMode;
};
/** Brand logo — cube mark or theme-aware main wordmark. */
export declare function BrandLogo({ className, size, variant, theme, }: BrandLogoProps): import("react").JSX.Element;
export {};
