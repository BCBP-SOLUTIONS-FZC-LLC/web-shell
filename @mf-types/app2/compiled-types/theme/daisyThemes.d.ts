export type AuraThemeMode = 'light' | 'dark';
export type AppThemeId = AuraThemeMode | string;
export type AppThemeOption = {
    id: AppThemeId;
    label: string;
    group: 'aura' | 'daisy';
};
export declare const APP_THEME_OPTIONS: AppThemeOption[];
export declare function isAuraTheme(themeId: AppThemeId): themeId is AuraThemeMode;
export declare function isThemeDark(themeId: AppThemeId): boolean;
export declare function auraModeFromAppTheme(themeId: AppThemeId): AuraThemeMode;
