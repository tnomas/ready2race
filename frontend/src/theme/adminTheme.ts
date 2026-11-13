import {alpha, createTheme, darken, Theme} from '@mui/material/styles'
import type {} from '@mui/x-data-grid/themeAugmentation'
import {contrastTextOn, readableColor} from './readableColor.ts'

/** Radius für Bedienelemente (Knopf, Feld, Menüeintrag). */
export const CONTROL_RADIUS = 8
/** Radius für Behälter (Karte, Dialog, Tabelle). */
export const CONTAINER_RADIUS = 12

/**
 * Das Verwaltungs-Theme: legt Raster, Typo-Skala, Radien, Ebenen, Fokusring und lesbare
 * Farbvarianten über das Mandanten-Theme [outer]. Farben und Schrift des Mandanten bleiben
 * unangetastet; abgeleitet werden nur Lese- und Flächenvarianten.
 *
 * Nur über `AdminThemeScope` verwenden (RootLayout, ResultsLayout) – Boards, Stream-Szenen,
 * Sprecher, Demo und Helfer-App behalten das Mandanten-Theme pixelgleich.
 *
 * Designsprache in Kürze: Arbeitsfläche `canvas` (leicht abgedunkelt), Inhaltsflächen `paper`
 * mit feinem Rahmen statt Schatten; Schatten nur für Schwebendes (Menü, Popover, Dialog).
 * Abstände im 8-px-Raster: 0.5 innerhalb einer Zeile, 1 zwischen eng verwandten Elementen,
 * 2 zwischen Feldern/Karteninhalt, 3 zwischen Abschnitten in Karten, 4 zwischen Seitenabschnitten.
 */
export const adminTheme = (outer: Theme): Theme => {
    const {palette, breakpoints} = outer
    const paper = palette.background.paper
    const textPrimary = palette.text.primary
    const canvas = darken(paper, 0.025)
    const border = alpha(textPrimary, 0.12)
    const primaryText = readableColor(palette.primary.main, paper)
    const focusRing = {
        outline: `2px solid ${readableColor(palette.primary.main, paper, 3)}`,
        outlineOffset: 2,
    }
    const xs = breakpoints.down('sm')

    // Nach dem Erzeugen gemergte Farben bekommen light/dark/contrastText nur über augmentColor;
    // die Schriftfarbe auf der Fläche wird mit 4,5:1 statt MUIs 3:1 gewählt.
    const tone = (main: string, light?: string) =>
        palette.augmentColor({
            color: {
                main,
                ...(light ? {light} : {}),
                contrastText: contrastTextOn(main, textPrimary),
            },
        })

    const flatPaper = {boxShadow: 'none', border: `1px solid ${border}`}

    return createTheme(
        // contrastThreshold muss schon beim Erzeugen der Palette gelten, sonst wirkt er nicht
        // auf getContrastText (z. B. Chips mit eigener Farbe).
        {...outer, palette: {...outer.palette, contrastThreshold: 4.5}},
        {
            palette: {
                primary: tone(palette.primary.main, palette.primary.light),
                // Vom Mandanten nicht gesetzt; statt MUI-Lila ein ruhiges Grau aus der Textfarbe.
                secondary: tone(palette.text.secondary),
                success: tone(palette.success.main),
                warning: tone(palette.warning.main),
                error: tone(palette.error.main),
                info: tone(palette.info.main),
                canvas,
                border,
                divider: border,
                primaryText,
                statusText: {
                    success: readableColor(palette.success.main, paper),
                    warning: readableColor(palette.warning.main, paper),
                    error: readableColor(palette.error.main, paper),
                    info: readableColor(palette.info.main, paper),
                },
            },
            shape: {borderRadius: CONTROL_RADIUS},
            typography: {
                h1: {
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    [xs]: {fontSize: '1.5rem'},
                },
                h2: {
                    fontSize: '1.375rem',
                    fontWeight: 600,
                    lineHeight: 1.3,
                    [xs]: {fontSize: '1.25rem'},
                },
                h3: {fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.35},
                h4: {fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.4},
                h5: {fontSize: '1rem', fontWeight: 600, lineHeight: 1.4},
                h6: {fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.4},
                subtitle1: {fontSize: '1rem', fontWeight: 500, lineHeight: 1.5},
                subtitle2: {fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.45},
                body1: {fontSize: '1rem', lineHeight: 1.5},
                body2: {fontSize: '0.875rem', lineHeight: 1.45},
                caption: {fontSize: '0.75rem', lineHeight: 1.4},
                overline: {
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    lineHeight: 1.5,
                },
                button: {fontSize: '0.875rem', fontWeight: 600, textTransform: 'none'},
            },
            components: {
                MuiButtonBase: {
                    styleOverrides: {root: {'&.Mui-focusVisible': focusRing}},
                },
                MuiButton: {
                    defaultProps: {size: 'medium', disableElevation: true},
                    styleOverrides: {
                        root: {borderRadius: CONTROL_RADIUS, minHeight: 36},
                        sizeSmall: {minHeight: 30},
                        // Touch: Klickziel nie unter 44 px
                        sizeMedium: {[xs]: {minHeight: 44}},
                    },
                },
                MuiIconButton: {
                    styleOverrides: {root: {borderRadius: CONTROL_RADIUS}},
                },
                MuiTextField: {defaultProps: {size: 'small'}},
                MuiOutlinedInput: {
                    styleOverrides: {
                        root: {borderRadius: CONTROL_RADIUS, backgroundColor: paper},
                        notchedOutline: {borderColor: alpha(textPrimary, 0.23)},
                    },
                },
                MuiFormHelperText: {
                    styleOverrides: {root: {marginLeft: 0, marginRight: 0, marginTop: 4}},
                },
                MuiPaper: {
                    styleOverrides: {
                        outlined: {borderColor: border},
                        rounded: {borderRadius: CONTAINER_RADIUS},
                        // Flache Inhaltsflächen: Rahmen statt Schatten. Schwebendes (Menü 8,
                        // Schublade 16, Dialog 24) behält seinen Schatten.
                        elevation1: flatPaper,
                        elevation2: flatPaper,
                        elevation3: flatPaper,
                    },
                },
                // Karten werden über elevation1–3 oben flach mit Rahmen; ein Standard
                // `variant: 'outlined'` würde mit vorhandenen `elevation={…}`-Props kollidieren
                // (MUI-Warnung „has no effect").
                MuiCard: {
                    styleOverrides: {root: {borderRadius: CONTAINER_RADIUS}},
                },
                MuiCardHeader: {
                    defaultProps: {
                        titleTypographyProps: {variant: 'h3'},
                        subheaderTypographyProps: {variant: 'body2'},
                    },
                    styleOverrides: {root: {paddingBottom: 8}},
                },
                MuiAppBar: {
                    defaultProps: {elevation: 0, color: 'inherit'},
                    styleOverrides: {
                        root: {background: paper, borderBottom: `1px solid ${border}`},
                    },
                },
                MuiToolbar: {
                    styleOverrides: {
                        root: {minHeight: 56, [breakpoints.up('sm')]: {minHeight: 60}},
                    },
                },
                MuiListItemButton: {
                    styleOverrides: {
                        root: {
                            borderRadius: CONTROL_RADIUS,
                            '&.Mui-selected, &.Mui-selected:hover': {
                                backgroundColor: palette.primary.light,
                                color: primaryText,
                                fontWeight: 600,
                            },
                        },
                    },
                },
                MuiTabs: {
                    styleOverrides: {
                        root: {minHeight: 44},
                        indicator: {height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3},
                    },
                },
                MuiTab: {
                    styleOverrides: {
                        root: {
                            minHeight: 44,
                            fontWeight: 500,
                            paddingInline: 16,
                            '&.Mui-selected': {fontWeight: 600, color: primaryText},
                        },
                    },
                },
                MuiDialog: {
                    defaultProps: {maxWidth: 'sm', fullWidth: true},
                    styleOverrides: {paper: {borderRadius: CONTAINER_RADIUS}},
                },
                MuiDialogTitle: {
                    styleOverrides: {
                        root: {fontSize: '1.125rem', fontWeight: 600, paddingRight: 56},
                    },
                },
                MuiDialogContent: {styleOverrides: {dividers: {borderColor: border}}},
                MuiDialogActions: {styleOverrides: {root: {padding: '12px 24px', gap: 8}}},
                MuiTooltip: {
                    defaultProps: {arrow: true, enterDelay: 400},
                    styleOverrides: {tooltip: {fontSize: '0.8125rem'}},
                },
                MuiAlert: {styleOverrides: {root: {borderRadius: CONTROL_RADIUS}}},
                MuiChip: {styleOverrides: {root: {borderRadius: 6}}},
                MuiLink: {
                    defaultProps: {underline: 'hover'},
                    styleOverrides: {root: {color: primaryText, cursor: 'pointer'}},
                },
                MuiBreadcrumbs: {
                    styleOverrides: {
                        root: {fontSize: '0.875rem'},
                        separator: {marginLeft: 4, marginRight: 4},
                    },
                },
                MuiTableCell: {
                    styleOverrides: {
                        head: {
                            fontWeight: 600,
                            backgroundColor: canvas,
                            color: palette.text.secondary,
                        },
                        root: {borderColor: border},
                    },
                },
                MuiDataGrid: {
                    styleOverrides: {
                        root: {
                            borderColor: border,
                            borderRadius: CONTAINER_RADIUS,
                            backgroundColor: paper,
                            '--DataGrid-containerBackground': canvas,
                            '--DataGrid-rowBorderColor': border,
                            '& .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within':
                                {outline: `2px solid ${primaryText}`, outlineOffset: -2},
                        },
                        columnHeaderTitle: {fontWeight: 600},
                        row: {'&:hover': {backgroundColor: alpha(palette.primary.main, 0.04)}},
                    },
                },
            },
        },
    )
}
