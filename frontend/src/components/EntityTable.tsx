import {
    DataGrid,
    DataGridProps,
    GridActionsCellItem,
    GridActionsCellItemProps,
    GridColDef,
    GridPaginationModel,
    GridRowParams,
    GridSortModel,
    GridValidRowModel,
} from '@mui/x-data-grid'
import {
    cloneElement,
    createContext,
    ReactElement,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import EntityCardList from './EntityCardList'
import {paginationParameters, PaginationParameters} from '@utils/ApiUtils.ts'
import {
    BaseEntityTableProps,
    EntityAction,
    MobileColumnMode,
    PageResponse,
    PartialRequired,
} from '@utils/types.ts'
import {LinkComponentProps, useNavigate} from '@tanstack/react-router'
import {RequestResult} from '@hey-api/client-fetch'
import {useTranslation} from 'react-i18next'
import {isNetworkError, useDebounce, useFeedback, useFetch} from '@utils/hooks.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {
    Box,
    Button,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import {Add, Clear, Delete, Edit, Search} from '@mui/icons-material'
import {useUser} from '@contexts/user/UserContext.ts'
import {ApiError, Privilege, Resource} from '@api/types.gen.ts'
import {Breakpoint} from '@mui/system/createBreakpoints/createBreakpoints'
import {
    EmptyState,
    EmptyStateProps,
    ErrorState,
    SectionHeader,
    visuallyHiddenSx,
} from '@components/ui'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {
    clampPage,
    entityDisplayName,
    firstPage,
    RowActionsLayout,
    rowActionsInline,
} from '@utils/entityTable.ts'
import {statusTextColor} from '../theme/themeColors.ts'

type EntityTableProps<
    Entity extends GridValidRowModel,
    GetError extends ApiError,
    DeleteError extends ApiError,
> = BaseEntityTableProps<Entity> & ExtendedEntityTableProps<Entity, GetError, DeleteError>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Standard wie bei GridColDef selbst
export type ExtendedGridColDef<R extends GridValidRowModel = any, V = any, F = V> = {
    requiredPrivilege?: Privilege
    /** Darstellung auf der mobilen Karte (siehe `MobileColumnMode`). */
    mobile?: MobileColumnMode
} & GridColDef<R, V, F>

type ExtendedEntityTableProps<
    Entity extends GridValidRowModel,
    GetError extends ApiError,
    DeleteError extends ApiError,
> = {
    initialPagination: GridPaginationModel
    pageSizeOptions: (number | {value: number; label: string})[]
    initialSort: GridSortModel
    columns: ExtendedGridColDef<Entity>[]
    dataRequest: (
        signal: AbortSignal,
        paginationParameters: PaginationParameters,
    ) => RequestResult<PageResponse<Entity>, GetError, false>
    customTableActions?: ReactNode
    customEntityActions?: (
        entity: Entity,
        checkPrivilege: (privilege: Privilege) => boolean,
    ) => EntityAction[]
    linkColumn?: (entity: Entity) => PartialRequired<LinkComponentProps<'a'>, 'to' | 'params'>
    gridProps?: Partial<DataGridProps>
    withSearch?: boolean
    editableIf?: (entity: Entity) => boolean
    creatable?: boolean
    hideEntityActions?: boolean
    mobileBreakpoint?: Breakpoint
    /**
     * Zeilenaktionen: `'auto'` (Standard) zeigt bis zu zwei Aktionen direkt als Icon-Knopf in der
     * Zeile, ab drei alle im ⋮-Menü; `'menu'` legt wie früher immer alles ins Menü.
     */
    rowActionsLayout?: RowActionsLayout
    /**
     * Name des Datensatzes für die Lösch-Bestätigung. Standard: `name`, sonst Vor- und Nachname,
     * sonst `identifier`; ohne lesbaren Namen spricht die Bestätigung vom „Eintrag".
     */
    getEntityLabel?: (entity: Entity) => string | undefined
    /** Leerzustand ohne aktive Suche anpassen (Satz, Erklärung, Icon, Aktion). */
    emptyState?: Partial<EmptyStateProps>
} & (
    | {
          deleteRequest: (entity: Entity) => RequestResult<void, DeleteError, false>
          onDelete?: () => void
          onDeleteError?: (error: DeleteError) => void
          deletableIf?: (entity: Entity) => boolean
      }
    | {
          deleteRequest?: never
          onDelete?: never
          onDeleteError?: never
          deletableIf?: never
      }
) &
    (
        | {
              resource: Resource
              parentResource?: never
              publicRead?: boolean
          }
        | {
              resource?: never
              parentResource: Resource
              publicRead?: boolean
          }
    )

type Crud = {
    create: boolean
    read: boolean
    update: boolean
    delete: boolean
}

const EntityTable = <
    Entity extends GridValidRowModel,
    GetError extends ApiError,
    DeleteError extends ApiError,
>({
    resource,
    parentResource,
    publicRead = false,
    ...props
}: EntityTableProps<Entity, GetError, DeleteError>) => {
    const user = useUser()

    let crud: Crud | undefined

    if (user.loggedIn) {
        if (resource) {
            crud = {
                create: user.checkPrivilege({action: 'CREATE', resource, scope: 'OWN'}),
                read: user.checkPrivilege({action: 'READ', resource, scope: 'OWN'}) || publicRead,
                update: user.checkPrivilege({action: 'UPDATE', resource, scope: 'OWN'}),
                delete: user.checkPrivilege({action: 'DELETE', resource, scope: 'OWN'}),
            }
        } else {
            const rest = user.checkPrivilege({
                action: 'UPDATE',
                resource: parentResource,
                scope: 'OWN',
            })
            crud = {
                create: rest,
                read:
                    user.checkPrivilege({
                        action: 'READ',
                        resource: parentResource,
                        scope: 'OWN',
                    }) || publicRead,
                update: rest,
                delete: rest,
            }
        }
    } else {
        crud = {
            create: false,
            read: publicRead,
            update: false,
            delete: false,
        }
    }

    return crud?.read && <EntityTableInternal {...props} crud={crud} />
}

type EntityTableInternalProps<
    Entity extends GridValidRowModel,
    GetError extends ApiError,
    DeleteError extends ApiError,
> = Omit<EntityTableProps<Entity, GetError, DeleteError>, 'resource' | 'privilege'> & {crud: Crud}

/** Leerzustand für das Grid-Overlay; per Kontext, damit `slots` eine stabile Komponente bleibt. */
const EmptyOverlayContext = createContext<ReactNode>(null)

const NoRowsOverlay = () => {
    const content = useContext(EmptyOverlayContext)
    return (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // Das Overlay liegt über dem Grid; Knöpfe darin müssen klickbar bleiben.
                pointerEvents: 'auto',
            }}>
            {content}
        </Box>
    )
}

const defaultEntityActions = () => []

// Zeilenhöhe nach Inhalt. Die Schätzung lässt das Grid Zeilen rendern, bevor sie gemessen sind;
// ohne sie blieb die Tabelle nach einer leeren Trefferliste manchmal leer, obwohl Daten da waren.
const autoRowHeight = () => 'auto' as const
const estimatedRowHeight = () => 37

const EntityTableInternal = <
    Entity extends GridValidRowModel,
    GetError extends ApiError,
    DeleteError extends ApiError,
>({
    entityName,
    title,
    id,
    hints,
    lastRequested,
    reloadData,
    openDialog,
    options,
    initialPagination,
    pageSizeOptions,
    initialSort,
    columns,
    dataRequest,
    customTableActions,
    customEntityActions = defaultEntityActions,
    linkColumn,
    gridProps,
    withSearch = true,
    crud,
    deleteRequest,
    onDelete,
    onDeleteError,
    deletableIf,
    editableIf,
    creatable = true,
    hideEntityActions,
    mobileBreakpoint,
    rowActionsLayout = 'auto',
    getEntityLabel,
    emptyState,
}: EntityTableInternalProps<Entity, GetError, DeleteError>) => {
    const {checkPrivilege} = useUser()
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()
    const theme = useTheme()
    const navigate = useNavigate()
    const isMobile = useMediaQuery(theme.breakpoints.down(mobileBreakpoint ?? 'md'))

    const [isDeletingRow, setIsDeletingRow] = useState(false)
    const deletingRef = useRef(false)

    // Was erst beim Klick gebraucht wird, liest die Aktion aus dieser Ref. So hängen die Spalten
    // nicht an Funktionen, die Aufrufer je Render neu bauen (`openDialog`, `reloadData` aus
    // `useEntityAdministration`), und ein Klick sieht trotzdem immer den aktuellen Stand.
    const handlers = useRef({
        openDialog,
        reloadData,
        deleteRequest,
        onDelete,
        onDeleteError,
        getEntityLabel,
        entityName,
        feedback,
        confirmAction,
    })
    handlers.current = {
        openDialog,
        reloadData,
        deleteRequest,
        onDelete,
        onDeleteError,
        getEntityLabel,
        entityName,
        feedback,
        confirmAction,
    }

    const deleteErrorColor = statusTextColor(theme, 'error')
    const hasDeleteRequest = deleteRequest !== undefined

    const requestDelete = useCallback(
        (entity: Entity) => {
            const h = handlers.current
            const name = h.getEntityLabel?.(entity) ?? entityDisplayName(entity)
            h.confirmAction(
                async () => {
                    const current = handlers.current
                    if (!current.deleteRequest || deletingRef.current) return
                    deletingRef.current = true
                    const del = current.deleteRequest
                    const {error} = await runRequest(setIsDeletingRow, () => del(entity)).finally(
                        () => {
                            deletingRef.current = false
                        },
                    )
                    if (isRequestNetworkError(error)) {
                        current.feedback.error(t('common.error.network'))
                    } else if (error) {
                        if (current.onDeleteError !== undefined) {
                            current.onDeleteError(error)
                        } else {
                            current.feedback.error(
                                t('entity.delete.error', {entity: current.entityName}),
                            )
                        }
                    } else {
                        current.onDelete?.()
                        current.feedback.success(
                            t('entity.delete.success', {entity: current.entityName}),
                        )
                    }
                    current.reloadData()
                },
                {
                    title: t('entity.delete.confirmTitle', {entity: h.entityName}),
                    content: name
                        ? t('entity.delete.confirmNamed', {name})
                        : t('entity.delete.confirmGeneric'),
                    okText: t('common.delete'),
                    destructive: true,
                },
            )
        },
        [t],
    )

    const getEntityActions = useCallback(
        (entity: Entity): EntityAction[] => {
            if (hideEntityActions) return []
            const custom = customEntityActions(entity, checkPrivilege).filter(
                (action): action is ReactElement<GridActionsCellItemProps> => !!action,
            )
            const canEdit = crud.update && !!options.entityUpdate && (editableIf?.(entity) ?? true)
            const canDelete =
                hasDeleteRequest &&
                crud.delete &&
                !!options.entityDelete &&
                (deletableIf?.(entity) ?? true)

            // Bis zu zwei Aktionen direkt in der Zeile (nur mit Icon möglich), sonst alle im Menü.
            const count = custom.length + (canEdit ? 1 : 0) + (canDelete ? 1 : 0)
            const inline =
                rowActionsInline(count, rowActionsLayout) &&
                custom.every(action => !!action.props.icon)

            const actions: ReactElement<GridActionsCellItemProps>[] = custom.map(action =>
                cloneElement(
                    action,
                    (inline
                        ? {showInMenu: false, title: action.props.label}
                        : {showInMenu: true}) as Partial<GridActionsCellItemProps>,
                ),
            )

            if (canEdit) {
                actions.push(
                    inline ? (
                        <GridActionsCellItem
                            icon={<Edit />}
                            label={t('common.edit')}
                            title={t('common.edit')}
                            onClick={() => handlers.current.openDialog({...entity})}
                        />
                    ) : (
                        <GridActionsCellItem
                            icon={<Edit />}
                            label={t('common.edit')}
                            onClick={() => handlers.current.openDialog({...entity})}
                            showInMenu={true}
                        />
                    ),
                )
            }

            // Löschen steht immer zuletzt; im Menü in der Gefahrenfarbe. In der Zeile ohne: ein
            // rotes Icon je Zeile wäre zu laut, die Bestätigung ist ohnehin rot.
            if (canDelete) {
                actions.push(
                    inline ? (
                        <GridActionsCellItem
                            icon={<Delete />}
                            label={t('common.delete')}
                            title={t('common.delete')}
                            onClick={() => requestDelete(entity)}
                        />
                    ) : (
                        <GridActionsCellItem
                            icon={<Delete sx={{color: deleteErrorColor}} />}
                            label={t('common.delete')}
                            onClick={() => requestDelete(entity)}
                            showInMenu={true}
                            sx={{color: deleteErrorColor}}
                        />
                    ),
                )
            }

            return actions
        },
        [
            hideEntityActions,
            customEntityActions,
            checkPrivilege,
            crud.update,
            crud.delete,
            options.entityUpdate,
            options.entityDelete,
            editableIf,
            deletableIf,
            hasDeleteRequest,
            rowActionsLayout,
            deleteErrorColor,
            requestDelete,
            t,
        ],
    )

    const visibleColumns = useMemo(
        () => columns.filter(c => !c.requiredPrivilege || checkPrivilege(c.requiredPrivilege)),
        [columns, checkPrivilege],
    )

    // Stabile Spalten-Referenz für das DataGrid (sonst initialisiert es die Spalten bei jedem
    // Render neu: gezogene Breiten springen zurück). Wirkt, soweit der Aufrufer `columns` und
    // `customEntityActions` selbst stabil hält; sonst wird wie bisher je Render neu gebaut.
    const cols: GridColDef<Entity>[] = useMemo(
        () => [
            ...visibleColumns,
            ...(!hideEntityActions
                ? [
                      {
                          field: 'actions',
                          type: 'actions' as const,
                          headerName: t('common.actions'),
                          renderHeader: () => (
                              <Box component={'span'} sx={visuallyHiddenSx}>
                                  {t('common.actions')}
                              </Box>
                          ),
                          getActions: (params: GridRowParams<Entity>) =>
                              getEntityActions(params.row).filter(
                                  (action): action is ReactElement<GridActionsCellItemProps> =>
                                      !!action,
                              ),
                      },
                  ]
                : []),
        ],
        [visibleColumns, hideEntityActions, getEntityActions, t],
    )

    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(initialPagination)
    const [sortModel, setSortModel] = useState<GridSortModel>(initialSort)

    const [searchInput, setSearchInput] = useState<string>('')
    const debouncedSearchInput = useDebounce(searchInput, 350)

    // Neue Suche beginnt auf Seite 1 – noch im selben Render, damit nicht erst die alte Seite mit
    // dem neuen Suchbegriff geladen wird.
    const [appliedSearch, setAppliedSearch] = useState(debouncedSearchInput)
    if (appliedSearch !== debouncedSearchInput) {
        setAppliedSearch(debouncedSearchInput)
        setPaginationModel(firstPage)
    }

    const handleSortModelChange = (model: GridSortModel) => {
        setSortModel(model)
        setPaginationModel(firstPage)
    }

    const {data, error, pending, reload} = useFetch(
        signal =>
            dataRequest(
                signal,
                paginationParameters(paginationModel, sortModel, debouncedSearchInput),
            ),
        {
            deps: [paginationModel, sortModel, debouncedSearchInput, lastRequested],
        },
    )

    const total = data?.pagination?.total

    // Hinter dem Ende (letzte Zeile der letzten Seite gelöscht) auf die letzte gültige Seite.
    useEffect(() => {
        if (total !== undefined) {
            setPaginationModel(m => clampPage(m, total))
        }
    }, [total])

    const rowCountRef = useRef(total ?? 0)

    const rowCount = useMemo(() => {
        if (total !== undefined) {
            rowCountRef.current = total
        }
        return rowCountRef.current
    }, [total])

    const canCreate = crud.create && !!options.entityCreate && creatable

    const emptyContent: ReactNode = debouncedSearchInput ? (
        <EmptyState
            dense
            title={t('entity.empty.search', {query: debouncedSearchInput})}
            action={
                <Button
                    variant={'outlined'}
                    size={'small'}
                    onClick={() => setSearchInput('')}
                    sx={{cursor: 'pointer'}}>
                    {t('entity.empty.resetSearch')}
                </Button>
            }
        />
    ) : (
        <EmptyState
            dense
            {...emptyState}
            title={emptyState?.title ?? t('entity.empty.title')}
            action={
                emptyState?.action ??
                (canCreate ? (
                    <Button
                        variant={'outlined'}
                        size={'small'}
                        startIcon={<Add />}
                        onClick={() => openDialog()}
                        sx={{cursor: 'pointer'}}>
                        {t('entity.add.action', {entity: entityName})}
                    </Button>
                ) : undefined)
            }
        />
    )

    const errorMessage = isNetworkError(error)
        ? t('common.error.network')
        : t('common.load.error.multiple.detailed', {entity: title ?? entityName})

    const hintsContent =
        hints && hints.length > 0
            ? hints.map((hint, index) => <Box key={index}>{hint}</Box>)
            : undefined

    return (
        <Box id={id}>
            {title ? (
                <SectionHeader title={title} description={hintsContent} />
            ) : (
                hintsContent && <Box sx={{color: 'text.secondary', mb: 1}}>{hintsContent}</Box>
            )}
            <Box
                display={'flex'}
                justifyContent={'space-between'}
                alignItems={'center'}
                flexWrap={'wrap'}
                sx={{gap: 2}}
                mb={1}
                pt={title ? 0 : 1}>
                {withSearch ? (
                    <TextField
                        size={'small'}
                        variant={'outlined'}
                        placeholder={t('common.search')}
                        value={searchInput}
                        onChange={e => {
                            setSearchInput(e.target.value)
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Escape' && searchInput) {
                                e.stopPropagation()
                                setSearchInput('')
                            }
                        }}
                        sx={{width: {xs: '100%', sm: 320}}}
                        slotProps={{
                            htmlInput: {'aria-label': t('common.search')},
                            input: {
                                startAdornment: (
                                    <InputAdornment position={'start'}>
                                        <Search fontSize={'small'} />
                                    </InputAdornment>
                                ),
                                endAdornment: searchInput ? (
                                    <InputAdornment position={'end'}>
                                        <IconButton
                                            size={'small'}
                                            edge={'end'}
                                            aria-label={t('entity.search.clear')}
                                            onClick={() => setSearchInput('')}
                                            sx={{cursor: 'pointer'}}>
                                            <Clear fontSize={'small'} />
                                        </IconButton>
                                    </InputAdornment>
                                ) : undefined,
                            },
                        }}
                    />
                ) : (
                    <Box />
                )}
                <Stack direction={'row'} flexWrap={'wrap'} gap={1}>
                    {customTableActions}
                    {canCreate && (
                        <Button
                            variant={'contained'}
                            startIcon={<Add />}
                            onClick={() => openDialog()}
                            sx={{cursor: 'pointer'}}>
                            {t('entity.add.action', {entity: entityName})}
                        </Button>
                    )}
                </Stack>
            </Box>
            {error ? (
                // Werkzeugleiste bleibt stehen: Suchbegriff korrigieren oder erneut laden.
                <ErrorState dense message={errorMessage} onRetry={reload} />
            ) : isMobile ? (
                <EntityCardList
                    data={data?.data ?? []}
                    columns={visibleColumns}
                    getActions={getEntityActions}
                    onRowClick={linkColumn ? entity => navigate(linkColumn(entity)) : undefined}
                    loading={pending || isDeletingRow}
                    rowCount={rowCount}
                    paginationModel={paginationModel}
                    onPaginationModelChange={setPaginationModel}
                    pageSizeOptions={pageSizeOptions}
                    emptyState={emptyContent}
                />
            ) : (
                <EmptyOverlayContext.Provider value={emptyContent}>
                    <Box sx={{display: 'flex', flexDirection: 'column'}}>
                        <DataGrid
                            onRowClick={
                                linkColumn ? params => navigate(linkColumn(params.row)) : undefined
                            }
                            onCellKeyDown={
                                linkColumn
                                    ? (params, event) => {
                                          // Enter auf einer fokussierten Zelle öffnet die Zeile
                                          // wie ein Klick; nicht in Aktionen oder Eingaben.
                                          if (
                                              event.key === 'Enter' &&
                                              params.field !== 'actions' &&
                                              event.target === event.currentTarget
                                          ) {
                                              navigate(linkColumn(params.row))
                                          }
                                      }
                                    : undefined
                            }
                            isRowSelectable={() => false}
                            paginationMode="server"
                            pageSizeOptions={[
                                ...pageSizeOptions,
                                ...(pageSizeOptions.includes(initialPagination.pageSize)
                                    ? []
                                    : [initialPagination.pageSize]),
                            ]}
                            disableColumnFilter={true}
                            paginationModel={paginationModel}
                            onPaginationModelChange={setPaginationModel}
                            sortingMode="server"
                            sortModel={sortModel}
                            onSortModelChange={handleSortModelChange}
                            columns={cols}
                            rows={data?.data ?? []}
                            rowCount={rowCount}
                            loading={pending || isDeletingRow}
                            density={'compact'}
                            getRowHeight={autoRowHeight}
                            getEstimatedRowHeight={estimatedRowHeight}
                            slots={{noRowsOverlay: NoRowsOverlay}}
                            slotProps={{
                                loadingOverlay: {
                                    variant: 'linear-progress',
                                    noRowsVariant: 'skeleton',
                                },
                            }}
                            sx={{
                                '--DataGrid-overlayHeight': '180px',
                                '&.MuiDataGrid-root--densityCompact .MuiDataGrid-cell': {
                                    py: '8px',
                                },
                                '&.MuiDataGrid-root--densityStandard .MuiDataGrid-cell': {
                                    py: '15px',
                                },
                                '&.MuiDataGrid-root--densityComfortable .MuiDataGrid-cell': {
                                    py: '22px',
                                },
                                '& .MuiDataGrid-row': {
                                    cursor: linkColumn ? 'pointer' : 'default',
                                },
                            }}
                            {...gridProps}
                        />
                    </Box>
                </EmptyOverlayContext.Provider>
            )}
        </Box>
    )
}

export default EntityTable
