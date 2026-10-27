import { type AppThemeId } from '../theme/daisyThemes';
type ThemePickerProps = {
    activeThemeId: AppThemeId;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (themeId: AppThemeId) => void;
};
export declare function ThemePicker({ activeThemeId, open, onOpenChange, onSelect }: ThemePickerProps): import("react").JSX.Element;
export {};
